// Elion's adapter to MiniCPM Desk Pet's documented local HTTP/SSE API.
// This is not a copy of the AGPL application or its restricted artwork.
export interface MiniCpmHealth {
  ok: boolean
  alive: boolean
  backend?: string
  model_name?: string | null
  device?: string
  startup_error?: string | null
  llama_server?: { status?: string; error?: string } | null
}
export interface CompanionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: string
  interrupted?: boolean
}
export interface MiniCpmRequest {
  messages: { role: 'user' | 'assistant'; content: string }[]
  system?: string
  thinking?: boolean
  max_new_tokens?: number
  stream: true
  silent: true
}
export type MiniCpmEvent = {
  event: 'start' | 'delta' | 'think' | 'end' | 'error'
  content?: string
  message?: string
}
interface DesktopCompanion {
  request: (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<unknown>
  chat: (id: string, body: MiniCpmRequest) => Promise<void>
  cancel: (id: string) => void
  onChunk: (
    listener: (message: { id: string; chunk?: string; done?: boolean; error?: string }) => void
  ) => () => void
}
const desktop = () => (window as unknown as { elion?: { miniCpm?: DesktopCompanion } }).elion?.miniCpm
export const COMPANION_OFFLINE =
  'MiniCPM is not connected. Start MiniCPM Desk Pet, finish its model setup, then connect again.'

/** UTF-8 text arrives in arbitrary network chunks, not whole SSE events. */
export class MiniCpmEventStream {
  private pending = ''
  ended = false
  constructor(private onEvent: (event: MiniCpmEvent) => void) {}
  feed(chunk: string) {
    this.pending = (this.pending + chunk).replace(/\r\n/g, '\n')
    let split = this.pending.indexOf('\n\n')
    while (split >= 0) {
      const packet = this.pending.slice(0, split)
      this.pending = this.pending.slice(split + 2)
      const data = packet
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) {
        const event = JSON.parse(data) as MiniCpmEvent
        if (!['start', 'delta', 'think', 'end', 'error'].includes(event.event))
          throw new Error('MiniCPM returned an unsupported stream event. Update the gateway and reconnect.')
        if (event.event === 'end' || event.event === 'error') this.ended = true
        this.onEvent(event)
      }
      split = this.pending.indexOf('\n\n')
    }
  }
  finish() {
    if (this.pending.trim()) this.feed('\n\n')
    if (!this.ended) throw new Error('The local model connection ended early. Retry the message.')
  }
}

export async function miniCpmRequest<T>(path: '/health' | '/models' | '/warmup', body?: unknown): Promise<T> {
  const bridge = desktop()
  if (bridge) return (await bridge.request(body ? 'POST' : 'GET', path, body)) as T
  const response = await fetch(`/api/companion${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Elion-Client': 'local-companion' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(path === '/warmup' ? 60000 : 8000)
  })
  if (!response.ok)
    throw new Error(
      response.status === 502 || response.status === 503 || response.status === 404
        ? COMPANION_OFFLINE
        : 'The MiniCPM gateway could not complete this request. Check its model status and retry.'
    )
  return (await response.json()) as T
}

export async function streamMiniCpm(
  body: MiniCpmRequest,
  onEvent: (event: MiniCpmEvent) => void,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  const stream = new MiniCpmEventStream(onEvent)
  const bridge = desktop()
  if (bridge) {
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      const off = bridge.onChunk((message) => {
        if (message.id !== id) return
        try {
          if (message.error) throw new Error(message.error)
          if (message.chunk) stream.feed(message.chunk)
          if (message.done) {
            stream.finish()
            cleanup()
            resolve()
          }
        } catch (error) {
          bridge.cancel(id)
          cleanup()
          reject(error)
        }
      })
      const cancel = () => {
        bridge.cancel(id)
        cleanup()
        reject(new DOMException('Cancelled', 'AbortError'))
      }
      const cleanup = () => {
        off()
        signal.removeEventListener('abort', cancel)
      }
      signal.addEventListener('abort', cancel, { once: true })
      void bridge.chat(id, body).catch((error) => {
        cleanup()
        reject(error)
      })
    })
  }
  const response = await fetch('/api/companion/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Elion-Client': 'local-companion' },
    body: JSON.stringify(body),
    signal
  })
  if (!response.ok || !response.body)
    throw new Error(
      response.status === 503
        ? COMPANION_OFFLINE
        : 'The local model could not reply. Check MiniCPM and retry.'
    )
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      stream.feed(decoder.decode(value, { stream: true }))
    }
    stream.feed(decoder.decode())
    stream.finish()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
