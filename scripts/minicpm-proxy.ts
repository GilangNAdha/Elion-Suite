import http from 'node:http'
import type { Plugin } from 'vite'

/** Same-origin, loopback-only transport for web/PWA. Never let browser code
 * call its own localhost, or turn a configurable URL into an open proxy. */
export function companionProxy(): Plugin {
  const target = new URL(process.env.ELION_MINICPM_TARGET || 'http://127.0.0.1:18765')
  if (
    target.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.pathname !== '/'
  )
    throw new Error('ELION_MINICPM_TARGET must be a loopback HTTP origin.')
  const handler = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/companion/')) {
      next()
      return
    }
    const route = req.url.replace('/api/companion', '').split('?')[0]
    const allowed =
      req.method === 'GET'
        ? ['/health', '/models'].includes(route)
        : req.method === 'POST' && ['/chat', '/warmup'].includes(route)
    const fail = (status: number, message: string) => {
      if (!res.headersSent) {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ error: message }))
      } else res.end()
    }
    if (!allowed) {
      fail(404, 'Unknown companion operation')
      return
    }
    if (req.headers['x-elion-client'] !== 'local-companion') {
      fail(403, 'Use Elion to access the companion gateway')
      return
    }
    const chunks: Buffer[] = []
    let size = 0,
      tooLarge = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 100000) {
        tooLarge = true
        fail(413, 'Message is too large')
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return
      const body = Buffer.concat(chunks)
      const upstream = http.request(
        new URL(`/api${route}`, target),
        {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            Accept: route === '/chat' ? 'text/event-stream' : 'application/json',
            ...(body.length ? { 'Content-Length': body.length } : {})
          }
        },
        (response) => {
          res.writeHead(response.statusCode || 502, {
            'Content-Type': response.headers['content-type'] || 'application/json',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no'
          })
          response.pipe(res)
        }
      )
      upstream.setTimeout(route === '/chat' ? 180000 : 10000, () => {
        upstream.destroy()
        fail(504, 'MiniCPM timed out. Check its model and retry.')
      })
      upstream.on('error', () =>
        fail(503, 'MiniCPM is not connected. Start its local gateway and complete model setup.')
      )
      res.on('close', () => upstream.destroy())
      upstream.end(body.length ? body : undefined)
    })
  }
  return {
    name: 'elion-local-companion',
    configureServer: (server) => {
      server.middlewares.use(handler)
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(handler)
    }
  }
}
