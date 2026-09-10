import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_PROVIDER_PRESETS,
  mapModelRows,
  createSSEDecoder,
  joinUrl,
  parseAnthropicDelta,
  parseOpenAiDelta,
  providerPreset,
  requestHeaders
} from '../src/lib/aiProviders'
import { aiIsConfigured, effectivePersona, ELION_PERSONA, PERSONA_PACKS, useAiStore } from '../src/stores/aiStore'

const cfg = {
  providerId: 'openrouter',
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  model: 'some/model',
  temperature: 0.7,
  maxTokens: 512,
  systemPrompt: '',
  personaId: 'elion'
}

describe('provider registry', () => {
  it('ships OpenRouter, 9Router, Claude, Codex-class and local gateways', () => {
    const ids = AI_PROVIDER_PRESETS.map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['openrouter', '9router', 'anthropic', 'openai', 'ollama', 'lmstudio', 'minicpm', 'custom']))
    expect(providerPreset('9router').baseUrl).toBe('http://localhost:20128/v1')
    expect(providerPreset('unknown-provider').id).toBe('custom')
  })
})

describe('endpoint and header composition', () => {
  it('joins base URLs without doubled slashes', () => {
    expect(joinUrl(cfg.baseUrl, 'chat/completions')).toBe('https://api.example.com/v1/chat/completions')
    expect(joinUrl('http://localhost:11434/v1', '/models')).toBe('http://localhost:11434/v1/models')
  })
  it('uses bearer auth for OpenAI-compatible APIs', () => {
    const headers = requestHeaders(cfg, 'openai', false)
    expect(headers.Authorization).toBe('Bearer sk-test')
  })
  it('adds the Anthropic version header and only opts into browser access for direct calls', () => {
    const direct = requestHeaders(cfg, 'anthropic', true)
    expect(direct['anthropic-version']).toBe('2023-06-01')
    expect(direct['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(direct['x-api-key']).toBe('sk-test')
    const bridged = requestHeaders(cfg, 'anthropic', false)
    expect(bridged['anthropic-dangerous-direct-browser-access']).toBeUndefined()
  })
})

describe('stream decoding', () => {
  it('reassembles SSE packets split across network chunks', () => {
    const seen: string[] = []
    const decoder = createSSEDecoder((payload) => seen.push(payload))
    decoder.feed('data: {"choices":[{"delta":{"content":"Hel')
    decoder.feed('lo"}}]}\n\ndata: [DO')
    decoder.feed('NE]\n\n')
    expect(seen).toHaveLength(2)
    expect(parseOpenAiDelta(seen[0]).text).toBe('Hello')
    expect(parseOpenAiDelta(seen[1]).done).toBe(true)
  })
  it('ignores keep-alive comments and malformed lines without dropping tokens', () => {
    const seen: string[] = []
    const decoder = createSSEDecoder((payload) => seen.push(payload))
    decoder.feed(': OPENROUTER PROCESSING\n\ndata: not json\n\ndata: {"choices":[{"delta":{"content":"x"}}]}\n\n')
    expect(seen).toHaveLength(2)
    expect(parseOpenAiDelta(seen[0])).toEqual({ done: false })
    expect(parseOpenAiDelta(seen[1]).text).toBe('x')
  })
  it('surfaces provider errors from the stream', () => {
    expect(() => parseOpenAiDelta(JSON.stringify({ error: { message: 'invalid api key' } }))).toThrow(
      'invalid api key'
    )
    expect(() => parseAnthropicDelta(JSON.stringify({ error: { message: 'overloaded' } }))).toThrow('overloaded')
  })
  it('parses anthropic content_block_delta events', () => {
    const first = parseAnthropicDelta(
      JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } })
    )
    expect(first.text).toBe('Hi')
    expect(parseAnthropicDelta(JSON.stringify({ type: 'message_stop' })).done).toBe(true)
    expect(parseAnthropicDelta(JSON.stringify({ type: 'ping' }))).toEqual({ done: false })
  })
})

describe('assistant configuration gate', () => {
  afterEach(() => {
    useAiStore.setState({ settings: { ...cfg, providerId: 'openrouter' } })
  })
  it('refuses cloud sends until key and model are set', () => {
    expect(aiIsConfigured({ ...cfg, providerId: 'openrouter', apiKey: '' })).toBe(false)
    expect(aiIsConfigured({ ...cfg, providerId: 'openrouter', model: '  ' })).toBe(false)
    expect(aiIsConfigured({ ...cfg, providerId: 'openrouter' })).toBe(true)
  })
  it('treats localhost gateways as usable without a key', () => {
    expect(aiIsConfigured({ ...cfg, providerId: '9router', baseUrl: 'http://localhost:20128/v1', apiKey: '', model: 'cc/x' })).toBe(true)
  })
  it('always considers the local MiniCPM path configured (health decides)', () => {
    expect(aiIsConfigured({ ...cfg, providerId: 'minicpm', model: '', apiKey: '' })).toBe(true)
  })
})

describe('model discovery parsing', () => {
  it('accepts OpenAI, OpenRouter and Anthropic-ish shapes for id + context', () => {
    expect(
      mapModelRows([
        { id: 'a/b', name: 'Pretty', context_length: 200000 },
        { id: 'plain' },
        { model: 'legacy.row', max_input_tokens: 8192 },
        { id: 42 },
        'bare-string',
        null
      ])
    ).toEqual([
      { id: 'a/b', name: 'Pretty', context: 200000 },
      { id: 'bare-string' },
      { id: 'legacy.row', context: 8192 },
      { id: 'plain' }
    ])
  })
  it('returns empty list for garbage payloads', () => {
    expect(mapModelRows(undefined)).toEqual([])
    expect(mapModelRows({ data: 'nope' })).toEqual([])
    expect(mapModelRows('nope')).toEqual([])
    expect(mapModelRows([{ no_id: true }, null, 7])).toEqual([])
  })
  it('reads the wrapped {models:[…]} shape too', () => {
    expect(mapModelRows({ models: [{ id: 'x', supported_total_tokens: 4096 }] })).toEqual([
      { id: 'x', context: 4096 }
    ])
  })
})

describe('persona packs', () => {
  it('default persona is the Elion identity', () => {
    expect(effectivePersona({ ...cfg })).toBe(ELION_PERSONA)
  })
  it('each pack ships its own distinct prompt; default maps to the identity', () => {
    const prompts = PERSONA_PACKS.map((pack) => effectivePersona({ ...cfg, personaId: pack.id }))
    expect(prompts[0]).toBe(ELION_PERSONA)
    expect(new Set(prompts).size).toBe(prompts.length)
    expect(prompts.every((text) => text.includes('Elion'))).toBe(true)
  })
  it('a custom system prompt always wins', () => {
    expect(effectivePersona({ ...cfg, personaId: 'ship', systemPrompt: '  pirate mode  ' })).toBe('pirate mode')
  })
  it('unknown pack ids fall back to the default', () => {
    expect(effectivePersona({ ...cfg, personaId: 'does-not-exist' })).toBe(ELION_PERSONA)
  })
})
