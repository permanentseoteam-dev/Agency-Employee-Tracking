import { contextBridge, ipcRenderer } from 'electron'
import type { TrackerApi } from './api'

// The only bridge between the renderer and Node/Electron. Later modules add
// session, tracking and settings calls here (see roadmap M2 and M5).
const api: TrackerApi = {
  logError: (message) => ipcRenderer.send('log:renderer-error', message)
}

contextBridge.exposeInMainWorld('tracker', api)
