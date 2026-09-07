// Elion Suite — Electron main process
// Windows packaging (NSIS + portable) via electron-builder, see package.json.

const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('node:path')

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

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
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
      nudgeActive = true
      win.webContents.send('lockdown:nudge')
      if (bringToFront) {
        setTimeout(() => {
          if (nudgeActive && win && !win.isFocused()) {
            if (win.isMinimized()) win.restore()
            win.focus()
          }
        }, 2500)
      }
    }, nudgeThresholdMs)
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
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  return true
})

// Fullscreen on a chosen display (multi-monitor awareness, §8.2)
ipcMain.handle('lockdown:fullscreen-on', (_e, { displayId }) => {
  if (!win) return false
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
  if (win && win.isFullScreen()) win.setFullScreen(false)
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
