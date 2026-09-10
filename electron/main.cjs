// Elion Suite — Electron main process
// Windows packaging (NSIS + portable) via electron-builder, see package.json.

const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
require('./minicpm.cjs').installMiniCpmIpc(ipcMain)
require('./ai.cjs').installAiIpc(ipcMain)

let win = null
let nudgeThresholdMs = 8000
let bringToFront = false
let nudgeTimer = null
let nudgeActive = false

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Elion Suite',
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Never leave a silent blank window: surface load failures on-screen.
  const fail = (msg) => {
    console.error('[elion]', msg)
    const html =
      '<!doctype html><html><body style="background:#0b0e14;color:#e6e9f2;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
      '<div style="max-width:440px;text-align:center"><h2 style="margin:0 0 10px">Elion Suite failed to start</h2>' +
      '<p style="color:#9aa3b5;margin:0 0 6px">' + msg + '</p>' +
      '<p style="color:#6b7280;margin:0">Run "npm run build" (or "npm run electron:dev") and relaunch.</p></div></body></html>'
    if (win) win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  }
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    fail(`Could not load ${url} (code ${code}: ${desc}).`)
  })
  win.webContents.on('console-message', (_e, _level, message) => {
    if (process.env.ELION_DEBUG) console.log('[renderer]', message)
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    const distFile = path.join(__dirname, '..', 'dist', 'index.html')
    if (!fs.existsSync(distFile)) {
      fail('dist/index.html is missing — the app was not built.')
    } else {
      win.loadFile(distFile)
    }
  }

  win.on('focus', () => {
    if (nudgeTimer) clearTimeout(nudgeTimer)
    nudgeTimer = null
    nudgeActive = false
  })

  // Best-effort distraction guard (§8.2): SOFT nudge only. This cannot and
  // does not attempt to block other applications or websites at the OS level.
  win.on('blur', () => {
    if (nudgeTimer) clearTimeout(nudgeTimer)
    nudgeTimer = setTimeout(() => {
      // The window may have been closed while the timer was pending; touching
      // a destroyed window throws an uncaught exception in the main process.
      if (!win || win.isDestroyed()) return
      nudgeActive = true
      win.webContents.send('lockdown:nudge')
      if (bringToFront) {
        setTimeout(() => {
          if (nudgeActive && win && !win.isDestroyed() && !win.isFocused()) {
            if (win.isMinimized()) win.restore()
            win.focus()
          }
        }, 2500)
      }
    }, nudgeThresholdMs)
  })

  win.on('closed', () => {
    if (nudgeTimer) clearTimeout(nudgeTimer)
    nudgeTimer = null
    nudgeActive = false
    if (win && win.isDestroyed()) win = null
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ---- IPC ----

ipcMain.handle('lockdown:set-nudge', (_e, { thresholdMs, bring }) => {
  nudgeThresholdMs = Math.max(3000, Number(thresholdMs) || 8000)
  bringToFront = !!bring
  return true
})

ipcMain.handle('lockdown:bring-to-front', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  return true
})

// Fullscreen on a chosen display (multi-monitor awareness, §8.2)
ipcMain.handle('lockdown:fullscreen-on', (_e, { displayId }) => {
  if (!win || win.isDestroyed()) return false
  if (displayId != null) {
    const displays = screen.getAllDisplays()
    const d = displays.find((x) => x.id === displayId)
    if (d) {
      win.setPosition(Math.round(d.bounds.x), Math.round(d.bounds.y))
      win.setSize(Math.round(d.bounds.width), Math.round(d.bounds.height))
    }
  }
  win.setFullScreen(true)
  return true
})

ipcMain.handle('lockdown:exit-fullscreen', () => {
  if (win && !win.isDestroyed() && win.isFullScreen()) win.setFullScreen(false)
  return true
})

ipcMain.handle('display:list', () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: `${Math.round(d.bounds.width)}×${Math.round(d.bounds.height)} @ ${d.scaleFactor}x`,
    primary: screen.getPrimaryDisplay().id === d.id,
    bounds: d.bounds
  }))
})

// Dictation shortcut capture only; inference remains in the shared local worker.
let voiceAccelerator = null
ipcMain.handle('voice:configure-shortcut', (_event, { enabled, accelerator }) => {
  if (voiceAccelerator) globalShortcut.unregister(voiceAccelerator)
  voiceAccelerator = null
  if (!enabled) return { ok: true }
  const allowed = ['CommandOrControl+Alt+D', 'CommandOrControl+Shift+Space']
  if (!allowed.includes(accelerator)) return { ok: false, error: 'Choose a supported dictation shortcut.' }
  try {
    const ok = globalShortcut.register(accelerator, () => {
      // Never dictate into another application, or compete with Handy outside Elion.
      if (win && !win.isDestroyed() && win.isFocused()) win.webContents.send('voice:toggle')
    })
    if (ok) voiceAccelerator = accelerator
    return { ok, error: ok ? undefined : 'This shortcut is in use — choose another in Settings.' }
  } catch { return { ok: false, error: 'The shortcut could not be registered — choose another in Settings.' } }
})
app.on('will-quit', () => globalShortcut.unregisterAll())
