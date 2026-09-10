// Elion Suite — system adapter (desktop only): local file reads +
// allow-listed commands. Renderer TIDAK PERNAH mengeksekusi langsung; semua
// lewat IPC ini, dan tool router di renderer tetap memasang permission guard
// (files.read / system.action) SEBELUM memanggil ke sini.
//
// Aturan keamanan:
// - files.read: path absolut, file teks ≤256 KB, output dipotong 64 KB.
// - system.action: HANYA pasangan {command, args} yang cocok PERSIS dengan
//   allow-list milik user (default kosong = semua ditolak). Tanpa shell —
//   execFile langsung, timeout 30 dtk, output dipotong.

const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')

const MAX_FILE_BYTES = 256 * 1024
const MAX_OUTPUT_CHARS = 64 * 1024
const RUN_TIMEOUT_MS = 30000

function defaultAllowPath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'elion-sys-allow.json')
}

function loadAllowlist(allowPath) {
  try {
    const rows = JSON.parse(fs.readFileSync(allowPath, 'utf8'))
    return Array.isArray(rows) ? rows.filter((r) => r && typeof r.command === 'string') : []
  } catch {
    return []
  }
}

function saveAllowlist(allowPath, rows) {
  fs.mkdirSync(path.dirname(allowPath), { recursive: true })
  fs.writeFileSync(allowPath, JSON.stringify(rows, null, 2), { mode: 0o600 })
  try { fs.chmodSync(allowPath, 0o600) } catch { /* fs non-posix */ }
}

/** Cocok persis: executable + seluruh argumen harus sama dengan entri. */
function matchAllowlist(rows, command, args) {
  const argv = Array.isArray(args) ? args.map(String) : []
  return rows.some(
    (r) =>
      r.command === command &&
      Array.isArray(r.args) &&
      r.args.length === argv.length &&
      r.args.every((a, i) => String(a) === argv[i])
  )
}

function readTextFile(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath))
    throw new Error('An absolute file path is required.')
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    throw new Error('File not found or not readable.')
  }
  if (!stat.isFile()) throw new Error('That path is not a file.')
  if (stat.size > MAX_FILE_BYTES) throw new Error('File is too large (over 256 KB).')
  const content = fs.readFileSync(filePath, 'utf8')
  if (content.includes('\0')) throw new Error('Not a text file.')
  return content.length > MAX_OUTPUT_CHARS
    ? { content: content.slice(0, MAX_OUTPUT_CHARS), truncated: true }
    : { content, truncated: false }
}

function runAllowed(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      Array.isArray(args) ? args.map(String) : [],
      { timeout: RUN_TIMEOUT_MS, maxBuffer: 512 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(new Error('Command timed out (30s).'))
          return
        }
        const cap = (s) => {
          const text = String(s || '')
          return text.length > 8192 ? `${text.slice(0, 8192)}…(truncated)` : text
        }
        resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: cap(stdout), stderr: cap(stderr) })
      }
    )
  })
}

function installSysIpc(ipcMain, deps = {}) {
  const allowPath = deps.allowPath || defaultAllowPath()

  ipcMain.handle('sys:read-file', (_e, { path: filePath }) => readTextFile(filePath))

  ipcMain.handle('sys:allowlist-get', () => loadAllowlist(allowPath))

  ipcMain.handle('sys:allowlist-add', (_e, { command, args }) => {
    const cmd = String(command || '').trim()
    if (!cmd) throw new Error('Command is required.')
    if (/[\r\n]/.test(cmd)) throw new Error('Command contains invalid characters.')
    const argv = Array.isArray(args) ? args.map((a) => String(a)) : []
    if (argv.some((a) => /[\r\n\0]/.test(a))) throw new Error('Arguments contain invalid characters.')
    const rows = loadAllowlist(allowPath)
    if (!matchAllowlist(rows, cmd, argv)) {
      rows.push({ command: cmd, args: argv })
      saveAllowlist(allowPath, rows)
    }
    return rows
  })

  ipcMain.handle('sys:allowlist-remove', (_e, { index }) => {
    const rows = loadAllowlist(allowPath)
    const i = Number(index)
    if (!Number.isInteger(i) || i < 0 || i >= rows.length) throw new Error('Unknown allow-list entry.')
    rows.splice(i, 1)
    saveAllowlist(allowPath, rows)
    return rows
  })

  ipcMain.handle('sys:run', async (_e, { command, args }) => {
    const rows = loadAllowlist(allowPath)
    if (!matchAllowlist(rows, String(command || ''), args))
      throw new Error('Not on the command allow-list. Add it in Settings › ELION runtime › System access first.')
    return runAllowed(String(command), args)
  })
}

module.exports = { installSysIpc, readTextFile, matchAllowlist, loadAllowlist }
