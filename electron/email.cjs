// Elion Suite — Elion's OWN Gmail account, main-process side.
// Token & client secret TIDAK PERNAH masuk renderer/model: vault di userData,
// semua panggilan Gmail API dari main process. Renderer hanya menerima hasil
// (daftar mail / isi / id kiriman) lewat IPC — sesuai Part II spek v4.3.
//
// Alur login: user memasukkan OAuth client (Desktop type) miliknya di
// Settings → Connect → jendela auth Google resmi → loopback capture →
// tukar code → simpan refresh token. Tanpa client milik user, tool email.*
// tetap `unconfigured` jujur — tidak ada akun/shared key bawaan.

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'].join(' ')
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

function defaultVaultPath() {
  // Lazy require: modul ini harus tetap bisa diimpor test tanpa Electron.
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'elion-mail.json')
}

function loadVault(vaultPath) {
  try {
    return JSON.parse(fs.readFileSync(vaultPath, 'utf8'))
  } catch {
    return {}
  }
}

function saveVault(vaultPath, vault) {
  fs.mkdirSync(path.dirname(vaultPath), { recursive: true })
  fs.writeFileSync(vaultPath, JSON.stringify(vault), { mode: 0o600 })
  try { fs.chmodSync(vaultPath, 0o600) } catch { /* fs non-posix */ }
}

// ---------- format murni (diuji unit, tanpa Electron) ----------

function decodeBase64Url(data) {
  const padded = String(data || '').replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function headerOf(headers, name) {
  const found = (headers || []).find((h) => String(h.name || '').toLowerCase() === name)
  return found ? String(found.value || '') : ''
}

/** Bangun RFC2822 mentah → base64url untuk messages.send. */
function buildRawMessage({ to, subject, body }) {
  if (!/.+@.+\..+/.test(String(to || ''))) throw new Error('Recipient address is invalid.')
  if (!String(subject || '').trim()) throw new Error('Subject is required.')
  const raw = [`To: ${to}`, `Subject: ${String(subject).replace(/\r?\n/g, ' ')}`, 'Content-Type: text/plain; charset=utf-8', '', String(body || '')].join('\r\n')
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Sederhanakan satu message Gmail API → {id, from, subject, date, snippet, body?}. */
function simplifyMessage(msg, withBody) {
  const headers = (msg.payload && msg.payload.headers) || []
  const out = {
    id: msg.id,
    from: headerOf(headers, 'from'),
    subject: headerOf(headers, 'subject'),
    date: headerOf(headers, 'date'),
    snippet: String(msg.snippet || '')
  }
  if (withBody) out.body = extractBody(msg.payload).slice(0, 12000)
  return out
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body && payload.body.data && String(payload.mimeType || '').startsWith('text/plain'))
    return decodeBase64Url(payload.body.data)
  for (const part of payload.parts || []) {
    const text = extractBody(part)
    if (text) return text
  }
  // fallback: bagian teks pertama (html dilucuti tag)
  const html = (payload.parts || []).map((p) => extractPartText(p, 'text/html')).find(Boolean)
  if (html) return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return ''
}

function extractPartText(part, mime) {
  if (!part) return ''
  if (part.mimeType === mime && part.body && part.body.data) return decodeBase64Url(part.body.data)
  for (const sub of part.parts || []) {
    const text = extractPartText(sub, mime)
    if (text) return text
  }
  return ''
}

// ---------- token ----------

async function accessToken(vaultPath) {
  const vault = loadVault(vaultPath)
  if (!vault.refreshToken || !vault.clientId) throw new Error('Mail is not connected. Add the OAuth client and Connect first.')
  if (vault.accessToken && vault.expiry && Date.now() < vault.expiry - 60000) return vault.accessToken
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: vault.clientId,
      client_secret: vault.clientSecret || '',
      refresh_token: vault.refreshToken,
      grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(15000)
  })
  if (!res.ok) throw new Error('The mail session expired and refresh failed — reconnect in Settings › Email.')
  const json = await res.json()
  vault.accessToken = json.access_token
  vault.expiry = Date.now() + (json.expires_in || 3600) * 1000
  saveVault(vaultPath, vault)
  return vault.accessToken
}

async function gmail(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${GMAIL_API}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail ? `Gmail API ${res.status}: ${detail.slice(0, 200)}` : `Gmail API replied ${res.status}.`)
  }
  return res.json()
}

// ---------- loopback OAuth ----------

function defaultOpenAuthWindow(url) {
  const { BrowserWindow } = require('electron')
  const win = new BrowserWindow({ width: 520, height: 680, autoHideMenuBar: true, title: 'Connect Elion mail' })
  void win.loadURL(url)
  return win
}

/**
 * Loopback OAuth: server 127.0.0.1 dibuat DULU (port aktual), baru URL auth
 * dibangun dengan redirect_uri yang cocok — lalu tunggu ?code=.
 */
function authorizeLoopback(openAuthWindow, buildAuthUrl, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    let win = null
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Sign-in timed out. Retry Connect.'))
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timer)
      try { server.close() } catch { /* abaikan */ }
      try { if (win && !win.isDestroyed()) win.close() } catch { /* abaikan */ }
    }
    const server = http.createServer((req, res) => {
      try {
        const u = new URL(req.url || '/', 'http://127.0.0.1')
        const code = u.searchParams.get('code')
        const error = u.searchParams.get('error')
        const redirectUri = `http://127.0.0.1:${server.address().port}/`
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<p>You can close this tab and return to Elion Suite.</p>')
        cleanup()
        if (code) resolve({ code, redirectUri })
        else reject(new Error(error ? `Google sign-in was not completed (${error}).` : 'Google sign-in returned no code.'))
      } catch (e) {
        cleanup()
        reject(e)
      }
    })
    server.on('error', (e) => {
      cleanup()
      reject(new Error(`Could not start the local sign-in listener: ${e.message}`))
    })
    server.listen(0, '127.0.0.1', () => {
      try {
        win = openAuthWindow(buildAuthUrl(`http://127.0.0.1:${server.address().port}/`))
      } catch (e) {
        cleanup()
        reject(e)
      }
    })
  })
}

async function exchangeCode(vaultPath, code, redirectUri) {
  const vault = loadVault(vaultPath)
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: vault.clientId,
      client_secret: vault.clientSecret || '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }),
    signal: AbortSignal.timeout(15000)
  })
  if (!res.ok) throw new Error('Google rejected the sign-in code. Retry Connect.')
  const json = await res.json()
  vault.refreshToken = json.refresh_token || vault.refreshToken
  vault.accessToken = json.access_token
  vault.expiry = Date.now() + (json.expires_in || 3600) * 1000
  saveVault(vaultPath, vault)
  return vault
}

function installMailIpc(ipcMain, deps = {}) {
  const vaultPath = deps.vaultPath || defaultVaultPath()
  const openAuthWindow = deps.openAuthWindow || defaultOpenAuthWindow

  ipcMain.handle('mail:status', () => {
    const vault = loadVault(vaultPath)
    if (vault.refreshToken) return { configured: true, account: vault.account || null, myEmail: vault.myEmail || null }
    if (vault.clientId) return { configured: false, hasClient: true, myEmail: vault.myEmail || null }
    return { configured: false, hasClient: false, myEmail: vault.myEmail || null }
  })

  ipcMain.handle('mail:save-client', (_e, { clientId, clientSecret }) => {
    const id = String(clientId || '').trim()
    if (!id) throw new Error('Client ID is required.')
    const vault = loadVault(vaultPath)
    const changed = vault.clientId && vault.clientId !== id
    saveVault(vaultPath, {
      ...vault,
      clientId: id,
      clientSecret: String(clientSecret || ''),
      // ganti client = sesi lama tidak valid lagi
      ...(changed ? { refreshToken: undefined, accessToken: undefined, expiry: undefined, account: undefined } : {})
    })
    return true
  })

  ipcMain.handle('mail:save-my-email', (_e, { email }) => {
    const addr = String(email || '').trim()
    if (addr && !/.+@.+\..+/.test(addr)) throw new Error('That email address looks invalid.')
    const vault = loadVault(vaultPath)
    saveVault(vaultPath, { ...vault, myEmail: addr || undefined })
    return true
  })

  ipcMain.handle('mail:connect', async () => {
    const vault = loadVault(vaultPath)
    if (!vault.clientId) throw new Error('Add the OAuth client ID first (see the setup guide).')
    const { code, redirectUri } = await authorizeLoopback(openAuthWindow, (uri) => {
      return (
        `${GOOGLE_AUTH}?response_type=code&client_id=${encodeURIComponent(vault.clientId)}` +
        `&redirect_uri=${encodeURIComponent(uri)}&scope=${encodeURIComponent(GMAIL_SCOPES)}` +
        `&access_type=offline&prompt=consent`
      )
    })
    const updated = await exchangeCode(vaultPath, code, redirectUri)
    const profile = await gmail('/profile', { token: updated.accessToken })
    updated.account = profile.emailAddress || updated.account
    saveVault(vaultPath, updated)
    return { account: updated.account || null }
  })

  ipcMain.handle('mail:disconnect', () => {
    const vault = loadVault(vaultPath)
    saveVault(vaultPath, { clientId: vault.clientId, clientSecret: vault.clientSecret, myEmail: vault.myEmail })
    return true
  })

  ipcMain.handle('mail:list', async (_e, { query, max }) => {
    const token = await accessToken(vaultPath)
    const n = Math.min(10, Math.max(1, Number(max) || 5))
    const params = new URLSearchParams({ maxResults: String(n) })
    if (query) params.set('q', String(query).slice(0, 200))
    const found = await gmail(`/messages?${params.toString()}`, { token })
    const out = []
    for (const m of (found.messages || []).slice(0, n)) {
      const full = await gmail(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { token })
      out.push(simplifyMessage(full, false))
    }
    return out
  })

  ipcMain.handle('mail:read', async (_e, { id }) => {
    if (!id || typeof id !== 'string') throw new Error('Message id is required.')
    const token = await accessToken(vaultPath)
    const full = await gmail(`/messages/${encodeURIComponent(id)}?format=full`, { token })
    return simplifyMessage(full, true)
  })

  ipcMain.handle('mail:send', async (_e, { to, subject, body }) => {
    const token = await accessToken(vaultPath)
    const raw = buildRawMessage({ to, subject, body })
    const sent = await gmail('/messages/send', { method: 'POST', token, body: { raw } })
    return { id: sent.id }
  })
}

module.exports = { installMailIpc, buildRawMessage, simplifyMessage, decodeBase64Url, loadVault, authorizeLoopback }
