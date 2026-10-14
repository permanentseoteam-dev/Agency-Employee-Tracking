import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { TrackerApi, TrackerStatus } from './api'

// The only bridge between the renderer and Node/Electron.
const api: TrackerApi = {
  logError: (message) => ipcRenderer.send('log:renderer-error', message),
  setSession: (session) => ipcRenderer.send('session:set', session),
  setSettings: (settings) => ipcRenderer.send('settings:set', settings),
  getToday: () => ipcRenderer.invoke('tracker:today'),
  getStatus: () => ipcRenderer.invoke('tracker:status'),
  onStatus: (listener) => {
    const handler = (_e: IpcRendererEvent, status: TrackerStatus) => listener(status)
    ipcRenderer.on('tracker:status', handler)
    return () => void ipcRenderer.removeListener('tracker:status', handler)
  },
  onSessionExpired: (listener) => {
    const handler = () => listener()
    ipcRenderer.on('session:expired', handler)
    return () => void ipcRenderer.removeListener('session:expired', handler)
  },
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  openLogsFolder: () => ipcRenderer.invoke('logs:open')
}

contextBridge.exposeInMainWorld('tracker', api)
