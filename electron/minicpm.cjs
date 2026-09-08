// Local MiniCPM transport. No AGPL code or restricted art is embedded.
// Native Node fetch stays on the user's computer; the renderer never targets localhost.
const ALLOWED = new Set(['/health', '/models', '/warmup'])
const FALLBACK = 'http://127.0.0.1:18765'
function localTarget(raw = process.env.ELION_MINICPM_TARGET || FALLBACK) {
  const url = new URL(raw)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/') throw new Error('MiniCPM must use a local HTTP gateway origin.')
  return url.origin
}
function installMiniCpmIpc(ipcMain) {
  const active = new Map()
  ipcMain.handle('minicpm:request', async (_event, { method, path, body }) => {
    if (!ALLOWED.has(path) || (path === '/warmup' ? method !== 'POST' : method !== 'GET')) throw new Error('Unsupported companion request')
    const response = await fetch(`${localTarget()}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body || {}) : undefined, signal: AbortSignal.timeout(path === '/warmup' ? 60000 : 8000) })
    if (!response.ok) throw new Error('MiniCPM is not ready. Finish its model setup and reconnect.')
    return response.json()
  })
  ipcMain.handle('minicpm:chat', async (event, { id, body }) => {
    if (typeof id !== 'string' || !Array.isArray(body?.messages) || body.messages.length > 16 || JSON.stringify(body).length > 100000) throw new Error('Invalid companion message')
    const key = `${event.sender.id}:${id}`
    if (active.has(key)) throw new Error('This reply is already running')
    const controller = new AbortController()
    active.set(key, controller)
    const send = (message) => { if (!event.sender.isDestroyed()) event.sender.send('minicpm:chunk', { id, ...message }) }
    try {
      const response = await fetch(`${localTarget()}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: true, silent: true }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]) })
      if (!response.ok || !response.body) throw new Error('The local MiniCPM model could not reply. Check its model status and retry.')
      const decoder = new TextDecoder()
      for await (const chunk of response.body) send({ chunk: decoder.decode(chunk, { stream: true }) })
      const last = decoder.decode(); if (last) send({ chunk: last })
      send({ done: true })
    } catch (error) { send({ error: controller.signal.aborted ? 'Reply stopped' : error.message || 'MiniCPM connection failed' }) }
    finally { active.delete(key) }
  })
  ipcMain.on('minicpm:cancel', (event, id) => { const key = `${event.sender.id}:${id}`; active.get(key)?.abort(); active.delete(key) })
}
module.exports = { installMiniCpmIpc, localTarget }
