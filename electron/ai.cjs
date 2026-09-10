// Elion Suite — AI provider transport for the desktop renderer.
// The main process performs the HTTP(S) requests so the user-configured
// endpoint (OpenRouter, 9Router on localhost, Anthropic, OpenAI, Ollama,
// LM Studio, any OpenAI-compatible gateway) never hits browser CORS. The API
// key only ever travels renderer → main → provider.
const ALLOWED_METHODS = new Set(['GET', 'POST'])

function safeEndpoint(raw) {
  let url
  try { url = new URL(String(raw)) } catch { throw new Error('AI endpoint must be an absolute URL.') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('AI endpoints must use http or https.')
  return url
}

function installAiIpc(ipcMain) {
  const active = new Map()

  ipcMain.handle('ai:request', async (_event, { url, method, headers, body }) => {
    if (!ALLOWED_METHODS.has(method)) throw new Error('Unsupported AI request method')
    safeEndpoint(url)
    const response = await fetch(url, {
      method,
      headers: { ...(headers || {}), 'User-Agent': 'ElionSuite/desktop' },
      body: method === 'POST' ? body : undefined,
      signal: AbortSignal.timeout(20000)
    })
    return { status: response.status, ok: response.ok, body: await response.text() }
  })

  ipcMain.handle('ai:stream', async (event, { id, url, headers, body }) => {
    if (typeof id !== 'string' || typeof body !== 'string' || body.length > 200000)
      throw new Error('Invalid AI stream request')
    safeEndpoint(url)
    const key = `${event.sender.id}:${id}`
    if (active.has(key)) throw new Error('This reply is already running')
    const controller = new AbortController()
    active.set(key, controller)
    const send = (message) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:chunk', { id, ...message })
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(headers || {}), 'User-Agent': 'ElionSuite/desktop' },
        body,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300000)])
      })
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '')
        throw new Error(detail ? `${response.status}: ${detail.slice(0, 400)}` : `Provider replied ${response.status}`)
      }
      const decoder = new TextDecoder()
      for await (const chunk of response.body) send({ chunk: decoder.decode(chunk, { stream: true }) })
      const last = decoder.decode()
      if (last) send({ chunk: last })
      send({ done: true })
    } catch (error) {
      send({ error: controller.signal.aborted ? 'Reply stopped' : error.message || 'AI provider connection failed' })
    } finally {
      active.delete(key)
    }
  })

  ipcMain.on('ai:cancel', (event, id) => {
    const key = `${event.sender.id}:${id}`
    active.get(key)?.abort()
    active.delete(key)
  })
}

module.exports = { installAiIpc, safeEndpoint }
