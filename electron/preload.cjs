// Elion Suite — preload: minimal, sandboxed bridge for the distraction
// guard (soft nudge only) and multi-monitor fullscreen selection.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('elion', {
  isElectron: true,
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
