import fs from 'node:fs'
import type { Plugin } from 'vite'

export function legalAssets(): Plugin {
  const read = () =>
    [
      'THIRD_PARTY_LICENSES.md',
      'third-party/react-bits/NOTICE.md',
      'third-party/react-bits/LICENSE.md',
      'third-party/blocksuite/NOTICE.md',
      'third-party/blocksuite/MPL-2.0.txt'
    ]
      .map((file) => `\n\n===== ${file} =====\n\n${fs.readFileSync(file, 'utf8')}`)
      .join('')
  return {
    name: 'elion-licence-notices',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'legal/notices.txt', source: read() })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/legal/notices.txt') {
          next()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(read())
      })
    }
  }
}
