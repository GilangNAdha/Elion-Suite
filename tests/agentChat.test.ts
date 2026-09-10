import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgentTurn, type AgentStreamEvent } from '../src/lib/agentChat'
import { db } from '../src/lib/db'
import { useActivityFeed } from '../src/lib/activity'

const cfg = {
  providerId: 'openrouter',
  baseUrl: 'https://api.example.com/v1/',
  apiKey: 'sk-test',
  model: 'some/model',
  temperature: 0,
  maxTokens: 256,
  systemPrompt: '',
  personaId: 'elion'
}

const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 })

describe('agent chat loop (tool calling nyata, bukan roleplay)', () => {
  beforeEach(async () => {
    await db.memories.clear()
    await db.agentEvents.clear()
    useActivityFeed.setState({ events: [] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('OpenAI: tool call dieksekusi nyata, hasilnya kembali ke model', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    { id: 'c1', function: { name: 'memory.remember', arguments: '{"content":"User likes tea","type":"preference","factKey":"user:drink"}' } }
                  ]
                }
              }
            ]
          })
        )
        .mockResolvedValueOnce(json({ choices: [{ message: { content: 'Noted — tea it is.' } }] }))
    )
    const events: AgentStreamEvent[] = []
    await runAgentTurn({
      api: 'openai',
      cfg,
      system: 'test',
      history: [{ role: 'user', content: 'remember I like tea' }],
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e)
    })
    const done = events.find((e) => e.type === 'tool-done')
    expect(done?.type === 'tool-done' && done.call.ok).toBe(true)
    // Bukti nyata: memori benar-benar tersimpan di DB, bukan klaim.
    const rows = await db.memories.toArray()
    expect(rows.map((r) => r.content)).toContain('User likes tea')
    expect(events.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : '')).join('')).toContain('Noted')
    expect(events[events.length - 1]).toEqual({ type: 'done' })
  })

  it('Anthropic: tool_use → tool_result loop sampai stop', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({
            content: [
              { type: 'text', text: 'Checking memory.' },
              { type: 'tool_use', id: 't1', name: 'memory.recall', input: { query: 'tea' } }
            ]
          })
        )
        .mockResolvedValueOnce(json({ content: [{ type: 'text', text: 'Nothing stored yet.' }], stop_reason: 'end_turn' }))
    )
    const events: AgentStreamEvent[] = []
    await runAgentTurn({
      api: 'anthropic',
      cfg,
      system: 'test',
      history: [{ role: 'user', content: 'what do you remember?' }],
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e)
    })
    expect(events.some((e) => e.type === 'tool-start')).toBe(true)
    expect(events.some((e) => e.type === 'tool-done')).toBe(true)
    expect(events[events.length - 1]).toEqual({ type: 'done' })
  })

  it('jawaban tanpa tool call selesai dalam satu iterasi', async () => {
    const fetchMock = vi.fn(async () => json({ choices: [{ message: { content: 'Hello.' } }] }))
    vi.stubGlobal('fetch', fetchMock)
    const events: AgentStreamEvent[] = []
    await runAgentTurn({
      api: 'openai',
      cfg,
      system: 'test',
      history: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(events).toEqual([{ type: 'text', text: 'Hello.' }, { type: 'done' }])
  })

  it('argumen JSON rusak dari model dilaporkan sebagai error tool, turn tetap selesai', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ choices: [{ message: { content: null, tool_calls: [{ id: 'c9', function: { name: 'memory.recall', arguments: '{broken' } }] } }] })
        )
        .mockResolvedValueOnce(json({ choices: [{ message: { content: 'My mistake.' } }] }))
    )
    const events: AgentStreamEvent[] = []
    await runAgentTurn({
      api: 'openai',
      cfg,
      system: 'test',
      history: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e)
    })
    const done = events.find((e) => e.type === 'tool-done')
    expect(done?.type === 'tool-done' && done.call.ok).toBe(false)
    expect(events[events.length - 1]).toEqual({ type: 'done' })
  })

  it('MiniCPM menolak jujur — store yang mem-fallback ke chat biasa', async () => {
    await expect(
      runAgentTurn({ api: 'minicpm', cfg, system: 't', history: [], signal: new AbortController().signal, onEvent: () => undefined })
    ).rejects.toThrow('AGENT_TOOLS_UNSUPPORTED')
  })

  it('abort di tengah turn menghentikan iterasi berikutnya', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => {
      controller.abort()
      return json({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'memory.recall', arguments: '{}' } }] } }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      runAgentTurn({ api: 'openai', cfg, system: 't', history: [{ role: 'user', content: 'hi' }], signal: controller.signal, onEvent: () => undefined })
    ).rejects.toThrow()
  })
})
