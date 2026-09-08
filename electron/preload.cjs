// Elion Suite — preload: minimal, sandboxed bridge for the distraction
// guard (soft nudge only) and multi-monitor fullscreen selection.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('elion', {
  isElectron: true,
  miniCpm: {
    request: (method, path, body) => ipcRenderer.invoke('minicpm:request', { method, path, body }),
    chat: (id, body) => ipcRenderer.invoke('minicpm:chat', { id, body }),
    cancel: (id) => ipcRenderer.send('minicpm:cancel', id),
    onChunk: (callback) => {
      const listener = (_event, message) => callback(message)
      ipcRenderer.on('minicpm:chunk', listener)
      return () => ipcRenderer.removeListener('minicpm:chunk', listener)
    }
  },
  configureVoiceShortcut: (enabled, accelerator) => ipcRenderer.invoke('voice:configure-shortcut', { enabled, accelerator }),
  onVoiceToggle: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('voice:toggle', listener)
    return () => ipcRenderer.removeListener('voice:toggle', listener)
  },
  platform: process.platform,
  setNudge: (thresholdMs, bring) => ipcRenderer.invoke('lockdown:set-nudge', { thresholdMs, bring }),
  bringToFront: () => ipcRenderer.invoke('lockdown:bring-to-front'),
  fullscreenOn: (displayId) => ipcRenderer.invoke('lockdown:fullscreen-on', { displayId }),
  exitFullscreen: () => ipcRenderer.invoke('lockdown:exit-fullscreen'),
  listDisplays: () => ipcRenderer.invoke('display:list'),
  onNudge: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('lockdown:nudge', listener)
    return () => ipcRenderer.removeListener('lockdown:nudge', listener)
  }
})
