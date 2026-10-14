import { contextBridge, ipcRenderer } from 'electron'
import type { TrackerApi } from './api'

// The only bridge between the renderer and Node/Electron. Later modules add
// tracking calls here (see roadmap M5).
const api: TrackerApi = {
  logError: (message) => ipcRenderer.send('log:renderer-error', message),
  setSession: (session) => ipcRenderer.send('session:set', session),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  openLogsFolder: () => ipcRenderer.invoke('logs:open')
}

contextBridge.exposeInMainWorld('tracker', api)
