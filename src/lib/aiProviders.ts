// Elion's multi-provider chat layer. One conversation surface, any model:
// OpenRouter and 9Router (OpenAI-compatible gateways), direct Anthropic
// Claude, direct OpenAI (incl. Codex-class models), local Ollama / LM Studio,
// any custom OpenAI-compatible endpoint, or the local MiniCPM gateway.
//
// Transports:
//  • Browser/PWA → same-origin-safe direct fetch (these APIs serve CORS;
//    Anthropic needs its explicit browser-access header).
//  • Electron  → the main-process bridge (elion.ai) so localhost gateways and
//    providers without CORS still work without a renderer origin check.

import { miniCpmRequest, streamMiniCpm } from './minicpm'

export type AiApiKind = 'openai' | 'anthropic' | 'minicpm'

export interface AiProviderPreset {
  id: string
  name: string
  tagline: string
  api: AiApiKind
  baseUrl: string
  needsKey: boolean
  keyHint?: string
  docsUrl?: string
  examples: string[]
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'One key for 300+ models — Claude, GPT, Gemini, DeepSeek, Llama, Grok and more.',
    api: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyHint: 'sk-or-…',
    docsUrl: 'https://openrouter.ai/settings/keys',
    examples: [
      'anthropic/claude-sonnet-4.5',
      'openai/gpt-5',
      'google/gemini-2.5-flash',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct'
    ]
  },
  {
    id: '9router',
    name: '9Router',
    tagline: 'Self-hosted OpenAI-compatible gateway routing Claude Code, Codex and 40+ providers.',
    api: 'openai',
    baseUrl: 'http://localhost:20128/v1',
    needsKey: false,
    keyHint: 'key from the 9Router dashboard (optional)',
    docsUrl: 'https://github.com/nightwalker89/n9router',
    examples: ['cc/claude-opus-4-7', 'oc/gpt-5', 'premium-coding']
  },
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    tagline: 'Direct access to the Anthropic Messages API.',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
    keyHint: 'sk-ant-…',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    examples: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest']
  },
  {
    id: 'openai',
    name: 'OpenAI / Codex',
    tagline: 'Direct access to OpenAI chat models, including the Codex line.',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    keyHint: 'sk-…',
    docsUrl: 'https://platform.openai.com/api-keys',
    examples: ['gpt-5', 'gpt-4o-mini', 'gpt-5-codex']
  },
  {
    id: 'google',
    name: 'Google Gemini',
    tagline: 'OpenAI-compatible endpoint of Google AI Studio — Flash for speed, Pro for depth.',
    api: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    keyHint: 'AIza…',
    docsUrl: 'https://aistudio.google.com/apikey',
    examples: ['gemini-2.5-flash', 'gemini-2.5-pro']
  },
  {
    id: 'groq',
    name: 'Groq (ultra-fast)',
    tagline: 'Low-latency LPU inference — Llama, Qwen and DeepSeek at hundreds of tokens/s.',
    api: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    keyHint: 'gsk_…',
    docsUrl: 'https://console.groq.com/keys',
    examples: ['llama-3.3-70b-versatile', 'gpt-oss-120b']
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    tagline: 'Any model pulled locally. Needs OLLAMA_ORIGINS=* for the browser build.',
    api: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/faq.md',
    examples: ['llama3.3', 'qwen2.5-coder', 'deepseek-r1']
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    tagline: 'Local server from the LM Studio app — enable CORS for browser use.',
    api: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    examples: ['local-model']
  },
  {
    id: 'minicpm',
    name: 'MiniCPM Desk Pet (local)',
    tagline: 'Elion’s original local companion gateway. No key required.',
    api: 'minicpm',
    baseUrl: '/api/companion',
    needsKey: false,
    docsUrl: 'https://github.com/OpenBMB/MiniCPM-Desk-Pet#installation',
    examples: []
  },
  {
    id: 'custom',
    name: 'Custom endpoint',
    tagline: 'Any OpenAI-compatible /chat/completions API — a proxy, vLLM, Azure gateway…',
    api: 'openai',
    baseUrl: '',
    needsKey: false,
    examples: []
  }
]

export function providerPreset(id: string): AiProviderPreset {
  return AI_PROVIDER_PRESETS.find((p) => p.id === id) ?? AI_PROVIDER_PRESETS[AI_PROVIDER_PRESETS.length - 1]
}

export interface AiChatConfig {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export const joinUrl = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`

function assertHttpUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('That endpoint is not a valid URL. Use a full http(s) address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('AI endpoints must use http or https.')
  return url.origin + url.pathname
}

/** Per-API auth + compat headers. `direct` marks browser-origin requests that
 * need the opt-in CORS header (Anthropic refuses browsers otherwise). */
export function requestHeaders(cfg: AiChatConfig, api: AiApiKind, direct: boolean): Record<string, string> {
  const json = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (api === 'anthropic')
    return {
      ...json,
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      ...(direct ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {})
    }
  if (api === 'openai') {
    const headers: Record<string, string> = { ...json }
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
    if (direct && cfg.baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Elion Suite'
    }
    return headers
  }
  return json
}

export function requestHeadersForChat(cfg: AiChatConfig, api: AiApiKind, direct: boolean): Record<string, string> {
  const headers = requestHeaders(cfg, api, direct)
  if (api !== 'minicpm') headers.Accept = 'text/event-stream'
  else headers['X-Elion-Client'] = 'local-companion'
  return headers
}

// ---------------------------------------------------------------------------
// SSE decoding — chunks arrive split at arbitrary byte boundaries.
// ---------------------------------------------------------------------------

/** Feeds raw stream text, invokes onData with each `data:` payload. */
export function createSSEDecoder(onData: (payload: string) => void) {
  let pending = ''
  return {
    feed(chunk: string) {
      pending = (pending + chunk).replace(/\r\n/g, '\n')
      let split = pending.indexOf('\n\n')
      while (split >= 0) {
        const packet = pending.slice(0, split)
        pending = pending.slice(split + 2)
        const data = packet
          .split('\n')
          // Comments (": OPENROUTER PROCESSING") and event names are ignored;
          // only data payloads carry the tokens.
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) onData(data)
        split = pending.indexOf('\n\n')
      }
    },
    finish() {
      if (pending.trim()) {
        const rest = pending.replace(/\n\n$/, '')
        const data = rest
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) onData(data)
      }
      pending = ''
    }
  }
}

/** One OpenAI-compatible streaming delta, or null for pings / [DONE]. */
export function parseOpenAiDelta(payload: string): { text?: string; done: boolean } {
  if (payload.trim() === '[DONE]') return { done: true }
  let json: {
    choices?: { delta?: { content?: unknown }; text?: unknown }[]
    error?: { message?: string }
  }
  try {
    json = JSON.parse(payload)
  } catch {
    return { done: false } // tolerate keep-alive garbage without killing the stream
  }
  if (json.error?.message) throw new Error(json.error.message)
  const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text
  return typeof delta === 'string' ? { text: delta, done: false } : { done: false }
}

/** One Anthropic Messages SSE payload (event JSON), content_block_delta only. */
export function parseAnthropicDelta(payload: string): { text?: string; done: boolean } {
  let json: {
    type?: string
    delta?: { type?: string; text?: string }
    error?: { message?: string }
  }
  try {
    json = JSON.parse(payload)
  } catch {
    return { done: false }
  }
  if (json.error?.message) throw new Error(json.error.message)
  if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta')
    return { text: json.delta.text ?? '', done: false }
  if (json.type === 'message_stop') return { done: true }
  return { done: false }
}

// ---------------------------------------------------------------------------
// Desktop bridge (Electron main process) — avoids CORS and localhost limits.
// ---------------------------------------------------------------------------

interface AiBridgeMessage {
  id: string
  chunk?: string
  done?: boolean
  error?: string
}
interface AiBridge {
  request(options: {
    url: string
    method: 'GET' | 'POST'
    headers: Record<string, string>
    body?: string
  }): Promise<{ status: number; ok: boolean; body: string }>
  stream(id: string, options: { url: string; headers: Record<string, string>; body: string }): Promise<void>
  cancel(id: string): void
  onChunk(listener: (message: AiBridgeMessage) => void): () => void
}
const bridge = (): AiBridge | undefined => (window as unknown as { elion?: { ai?: AiBridge } }).elion?.ai

export const isDesktopBridge = () => bridge() !== undefined

async function readThroughBridge(
  url: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: string
): Promise<unknown> {
  const ai = bridge()
  let text: string
  if (ai) {
    const response = await ai.request({ url, method, headers, body })
    if (!response.ok)
      throw await statusError(new Response(response.body, { status: response.status }))
    text = response.body
  } else {
    const response = await fetch(url, { method, headers, ...(body ? { body } : {}), signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw await statusError(response)
    text = await response.text()
  }
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    // Gateways sometimes answer 200 with an HTML error page (proxy login,
    // maintenance). A raw SyntaxError would confuse; say what happened.
    throw new Error(
      'The provider returned a non-JSON response. Check the base URL — it may point at a login page or proxy instead of the API.'
    )
  }
}

async function statusError(response: Response): Promise<Error> {
  let detail = ''
  try {
    const body = await response.text()
    const json = body ? JSON.parse(body) : null
    detail = json?.error?.message ?? json?.message ?? body.slice(0, 220)
  } catch {
    /* keep status only */
  }
  if (response.status === 401 || response.status === 403)
    return new Error(`The provider rejected the API key (${response.status}). Check the key in Settings › AI assistant.`)
  if (response.status === 404) return new Error('Endpoint not found (404). Check the base URL and model id.')
  if (response.status === 429) return new Error('Rate limited by the provider (429). Wait a moment and retry.')
  return new Error(detail || `The provider replied ${response.status}.`)
}

// ---------------------------------------------------------------------------
// Public API — model discovery + streaming chat.
// ---------------------------------------------------------------------------

export interface AiModelRow {
  id: string
  name?: string
  context?: number
}

/** Longgar oleh desain: tiap gateway menamai field-nya beda (OpenRouter, Groq,
 * Ollama, LM Studio, Anthropic) — kita ambil yang ada, sisanya kita diamkan. */
export function mapModelRows(raw: unknown): AiModelRow[] {
  // Toleran: beberapa gateway membalik {data:[…]} / {models:[…]}, bukan array polos.
  const candidates = Array.isArray(raw)
    ? [raw as unknown[]]
    : [(raw as { data?: unknown })?.data, (raw as { models?: unknown })?.models]
  const rows = candidates.find(Array.isArray) ?? []
  return rows
    .map((row): AiModelRow | null => {
      if (typeof row === 'string') return { id: row }
      if (!row || typeof row !== 'object') return null
      const r = row as Record<string, unknown>
      const id = r.id ?? r.model ?? r.name
      if (typeof id !== 'string' || !id) return null
      const context =
        typeof r.context_length === 'number'
          ? r.context_length
          : typeof r.max_input_tokens === 'number'
            ? r.max_input_tokens
            : typeof r.supported_total_tokens === 'number'
              ? r.supported_total_tokens
              : undefined
      const name = typeof r.name === 'string' && r.name !== id ? (r.name as string) : undefined
      return { id, name, context }
    })
    .filter((row): row is AiModelRow => row !== null)
    .sort((a, b) => a.id.localeCompare(b.id))
}

export async function listModelDetails(api: AiApiKind, cfg: AiChatConfig): Promise<AiModelRow[]> {
  if (api === 'minicpm') {
    const data = await miniCpmRequest<unknown>('/models')
    return mapModelRows(data)
  }
  const endpoint = assertHttpUrl(joinUrl(cfg.baseUrl, 'models'))
  const raw = await readThroughBridge(endpoint, 'GET', requestHeaders(cfg, api, !bridge()))
  return mapModelRows(raw)
}

export async function listModelIds(api: AiApiKind, cfg: AiChatConfig): Promise<string[]> {
  return (await listModelDetails(api, cfg)).map((row) => row.id)
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

function extractError(payload: string): string | null {
  try {
    const json = JSON.parse(payload) as { error?: { message?: string } | string }
    if (typeof json.error === 'string') return json.error
    if (json.error?.message) return json.error.message
  } catch {
    /* not an error object */
  }
  return null
}

export async function streamChatCompletion(
  api: AiApiKind,
  cfg: AiChatConfig,
  system: string,
  history: ChatTurn[],
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  if (api === 'minicpm') {
    let endSeen = false
    await streamMiniCpm(
      { messages: history, system, thinking: false, max_new_tokens: cfg.maxTokens, stream: true, silent: true },
      (event) => {
        if (event.event === 'error') throw new Error(event.message || 'MiniCPM could not complete the reply.')
        if (event.event === 'delta' && event.content) onDelta(event.content)
        if (event.event === 'end') endSeen = true
      },
      signal
    )
    if (!endSeen) throw new Error('The reply ended early. Retry the message.')
    return
  }

  const messages = [{ role: 'system', content: system }, ...history]
  const request =
    api === 'anthropic'
      ? {
          url: assertHttpUrl(joinUrl(cfg.baseUrl, 'messages')),
          body: JSON.stringify({
            model: cfg.model,
            system,
            messages: history,
            max_tokens: Math.min(cfg.maxTokens, 8192),
            temperature: cfg.temperature,
            stream: true
          })
        }
      : {
          url: assertHttpUrl(joinUrl(cfg.baseUrl, 'chat/completions')),
          body: JSON.stringify({
            model: cfg.model,
            messages,
            max_tokens: cfg.maxTokens,
            temperature: cfg.temperature,
            stream: true
          })
        }

  const ai = bridge()
  if (ai) {
    await new Promise<void>((resolve, reject) => {
      const id = crypto.randomUUID()
      const decoder = createSSEDecoder((payload) => {
        if (payload.trim() === '[DONE]') return
        const error = extractError(payload)
        if (error) throw new Error(error)
        const delta = api === 'anthropic' ? parseAnthropicDelta(payload) : parseOpenAiDelta(payload)
        if (delta.text) onDelta(delta.text)
      })
      const off = ai.onChunk((message) => {
        if (message.id !== id) return
        try {
          if (message.error) throw new Error(message.error)
          if (message.chunk) decoder.feed(message.chunk)
          if (message.done) {
            decoder.finish()
            cleanup()
            resolve()
          }
        } catch (error) {
          ai.cancel(id)
          cleanup()
          reject(error)
        }
      })
      const cancel = () => {
        ai.cancel(id)
        cleanup()
        reject(new DOMException('Cancelled', 'AbortError'))
      }
      const cleanup = () => {
        off()
        signal.removeEventListener('abort', cancel)
      }
      signal.addEventListener('abort', cancel, { once: true })
      void ai
        .stream(id, { url: request.url, headers: requestHeadersForChat(cfg, api, false), body: request.body })
        .catch((error) => {
          cleanup()
          reject(error)
        })
    })
    return
  }

  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  let response: Response
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: requestHeadersForChat(cfg, api, true),
      body: request.body,
      signal
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(
      'The provider could not be reached from the browser (network or CORS). The desktop app talks to any endpoint directly — or point the preset at a gateway that allows browser origins.'
    )
  }
  if (!response.ok) throw await statusError(response)
  if (!response.body) throw new Error('The provider returned no stream.')
  const decoder = createSSEDecoder((payload) => {
    if (payload.trim() === '[DONE]') return
    const error = extractError(payload)
    if (error) throw new Error(error)
    const delta = api === 'anthropic' ? parseAnthropicDelta(payload) : parseOpenAiDelta(payload)
    if (delta.text) onDelta(delta.text)
  })
  const reader = response.body.getReader()
  const text = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      decoder.feed(text.decode(value, { stream: true }))
    }
    decoder.feed(text.decode())
    decoder.finish()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export function friendlyFetchError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'The request failed. Check the endpoint, key and model.'
}
