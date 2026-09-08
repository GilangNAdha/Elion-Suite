// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { companionProxy } from '../scripts/minicpm-proxy'

type Handler = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void
let model: http.Server, app: http.Server, base: string
const original = process.env.ELION_MINICPM_TARGET
async function listen(server: http.Server) {
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  return (server.address() as AddressInfo).port
}
beforeAll(async () => {
  // A protocol fixture, not a neural model. It exists only during this test.
  model = http.createServer((req, res) => {
    if (req.url === '/api/chat') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: {"event":"delta","content":"protocol fixture"}\n\n')
      res.end('data: {"event":"end"}\n\n')
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, alive: true, model_name: 'Test fixture, not a model' }))
    }
  })
  process.env.ELION_MINICPM_TARGET = `http://127.0.0.1:${await listen(model)}`
  let handler!: Handler
  const plugin = companionProxy()
  const configure = plugin.configureServer as (server: {
    middlewares: { use: (handler: Handler) => void }
  }) => void
  configure({
    middlewares: {
      use: (value) => {
        handler = value
      }
    }
  })
  app = http.createServer((req, res) =>
    handler(req, res, () => {
      res.writeHead(404)
      res.end()
    })
  )
  base = `http://127.0.0.1:${await listen(app)}`
})
afterAll(async () => {
  process.env.ELION_MINICPM_TARGET = original
  await Promise.all(
    [model, app].map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  )
})
describe('same-origin MiniCPM transport', () => {
  it('forwards a health check to the fixed loopback model service', async () => {
    const response = await fetch(`${base}/api/companion/health`, {
      headers: { 'X-Elion-Client': 'local-companion' }
    })
    expect(response.status).toBe(200)
    expect((await response.json()).model_name).toBe('Test fixture, not a model')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('forwards actual SSE bytes rather than fabricating a chat response', async () => {
    const response = await fetch(`${base}/api/companion/chat`, {
      method: 'POST',
      headers: { 'X-Elion-Client': 'local-companion', 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }], stream: true })
    })
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(await response.text()).toContain('"event":"end"')
  })
  it('rejects cross-origin simple requests and unapproved operations', async () => {
    expect((await fetch(`${base}/api/companion/chat`, { method: 'POST', body: 'unexpected' })).status).toBe(
      403
    )
    expect(
      (
        await fetch(`${base}/api/companion/update-apply`, {
          method: 'POST',
          headers: { 'X-Elion-Client': 'local-companion' }
        })
      ).status
    ).toBe(404)
  })
  it('cannot be configured as an external URL or credential proxy', () => {
    const local = process.env.ELION_MINICPM_TARGET
    process.env.ELION_MINICPM_TARGET = 'https://example.com'
    expect(() => companionProxy()).toThrow('loopback')
    process.env.ELION_MINICPM_TARGET = 'http://user:password@127.0.0.1:18765'
    expect(() => companionProxy()).toThrow('loopback')
    process.env.ELION_MINICPM_TARGET = local
  })
})
