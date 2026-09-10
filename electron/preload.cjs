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
  ai: {
    request: (options) => ipcRenderer.invoke('ai:request', options),
    stream: (id, options) => ipcRenderer.invoke('ai:stream', { id, ...options }),
    cancel: (id) => ipcRenderer.send('ai:cancel', id),
    onChunk: (callback) => {
      const listener = (_event, message) => callback(message)
      ipcRenderer.on('ai:chunk', listener)
      return () => ipcRenderer.removeListener('ai:chunk', listener)
    }
  },
  configureVoiceShortcut: (enabled, accelerator) => ipcRenderer.invoke('voice:configure-shortcut', { enabled, accelerator }),
  onVoiceToggle: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('voice:toggle', listener)
    return () => ipcRenderer.removeListener('voice:toggle', listener)
  },
  mail: {
    status: () => ipcRenderer.invoke('mail:status'),
    saveClient: (clientId, clientSecret) => ipcRenderer.invoke('mail:save-client', { clientId, clientSecret }),
    saveMyEmail: (email) => ipcRenderer.invoke('mail:save-my-email', { email }),
    connect: () => ipcRenderer.invoke('mail:connect'),
    disconnect: () => ipcRenderer.invoke('mail:disconnect'),
    list: (query, max) => ipcRenderer.invoke('mail:list', { query, max }),
    read: (id) => ipcRenderer.invoke('mail:read', { id }),
    send: (to, subject, body) => ipcRenderer.invoke('mail:send', { to, subject, body })
  },
  sys: {
    readFile: (filePath) => ipcRenderer.invoke('sys:read-file', { path: filePath }),
    allowlist: () => ipcRenderer.invoke('sys:allowlist-get'),
    addAllow: (command, args) => ipcRenderer.invoke('sys:allowlist-add', { command, args }),
    removeAllow: (index) => ipcRenderer.invoke('sys:allowlist-remove', { index }),
    run: (command, args) => ipcRenderer.invoke('sys:run', { command, args })
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
