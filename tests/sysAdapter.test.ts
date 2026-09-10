import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const sys = require('../electron/sys.cjs') as {
  installSysIpc: (ipcMain: { handle: (channel: string, fn: (event: unknown, args: Record<string, unknown>) => unknown) => void }, deps?: { allowPath?: string }) => void
  matchAllowlist: (rows: { command: string; args: string[] }[], command: string, args: unknown) => boolean
  readTextFile: (filePath: string) => { content: string; truncated: boolean }
}
const { installSysIpc, matchAllowlist, readTextFile } = sys

function stubIpc() {
  const handlers: Record<string, (event: unknown, args: Record<string, unknown>) => unknown> = {}
  return {
    handlers,
    ipcMain: { handle: (channel: string, fn: (event: unknown, args: Record<string, unknown>) => unknown) => { handlers[channel] = fn } }
  }
}

describe('system adapter (main process)', () => {
  let dir: string
  let handlers: Record<string, (event: unknown, args: Record<string, unknown>) => unknown>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'elion-sys-'))
    const stub = stubIpc()
    handlers = stub.handlers
    installSysIpc(stub.ipcMain, { allowPath: join(dir, 'allow.json') })
  })

  it('reads a text file and rejects non-absolute paths, dirs, and missing files', async () => {
    const file = join(dir, 'note.txt')
    writeFileSync(file, 'hello elion')
    // Handler sinkron (ipcMain sungguhan yang membungkus jadi promise).
    expect(handlers['sys:read-file']({}, { path: file })).toEqual({ content: 'hello elion', truncated: false })
    expect(() => handlers['sys:read-file']({}, { path: 'relative.txt' })).toThrow('absolute')
    expect(() => handlers['sys:read-file']({}, { path: dir })).toThrow('not a file')
    expect(() => handlers['sys:read-file']({}, { path: join(dir, 'nope.txt') })).toThrow('not found')
  })

  it('readTextFile caps output and refuses binary', () => {
    const big = join(dir, 'big.txt')
    writeFileSync(big, 'x'.repeat(70 * 1024))
    const capped = readTextFile(big)
    expect(capped.truncated).toBe(true)
    expect(capped.content.length).toBe(64 * 1024)
    const bin = join(dir, 'bin.dat')
    writeFileSync(bin, Buffer.from([0x00, 0x01, 0x02]))
    expect(() => readTextFile(bin)).toThrow('Not a text file')
  })

  it('matchAllowlist requires an exact command + args match', () => {
    const rows = [{ command: 'git', args: ['status', '--short'] }]
    expect(matchAllowlist(rows, 'git', ['status', '--short'])).toBe(true)
    expect(matchAllowlist(rows, 'git', ['status'])).toBe(false)
    expect(matchAllowlist(rows, 'git', ['status', '--short', 'extra'])).toBe(false)
    expect(matchAllowlist(rows, 'gitx', ['status', '--short'])).toBe(false)
  })

  it('manages the allow-list: add → get → remove', async () => {
    await handlers['sys:allowlist-add']({}, { command: 'git', args: ['status'] })
    expect(handlers['sys:allowlist-get']({}, {})).toEqual([{ command: 'git', args: ['status'] }])
    await handlers['sys:allowlist-remove']({}, { index: 0 })
    expect(handlers['sys:allowlist-get']({}, {})).toEqual([])
  })

  it('sys:run denies anything not allow-listed, runs exact matches without a shell', async () => {
    await expect(handlers['sys:run']({}, { command: 'anything', args: [] })).rejects.toThrow('allow-list')
    const node = process.execPath
    await handlers['sys:allowlist-add']({}, { command: node, args: ['--version'] })
    const result = (await handlers['sys:run']({}, { command: node, args: ['--version'] })) as { code: number; stdout: string }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('v')
    // same binary, different args → still denied
    await expect(handlers['sys:run']({}, { command: node, args: ['--help'] })).rejects.toThrow('allow-list')
  })
})

describe('sys client without the desktop bridge', () => {
  it('throws the honest desktop-only error on web', async () => {
    const { sysReadFile } = await import('../src/lib/sysClient')
    await expect(sysReadFile('/tmp/x')).rejects.toThrow('desktop app')
  })
})
