import { app, ipcMain, shell } from 'electron'
import type { AutostartState, SessionInfo } from '../preload/api'
import { log, logsFolder } from './log'

let session: SessionInfo | null = null

/** The signed-in user, handed over by the renderer. The tracker (M5) writes as this user. */
export function currentSession(): SessionInfo | null {
  return session
}

function autostartState(): AutostartState {
  if (!app.isPackaged) return { supported: false, enabled: false }
  return { supported: true, enabled: app.getLoginItemSettings().openAtLogin }
}

export function registerIpc(): void {
  ipcMain.on('log:renderer-error', (_event, message: unknown) => {
    log.error('[renderer]', String(message))
  })

  ipcMain.on('session:set', (_event, next: SessionInfo | null) => {
    const changed = session?.userId !== next?.userId
    session = next && typeof next.token === 'string' && typeof next.userId === 'string' ? next : null
    if (changed) log.info(session ? `signed in as ${session.userId} (${session.role})` : 'signed out')
  })

  ipcMain.handle('autostart:get', () => autostartState())

  ipcMain.handle('autostart:set', (_event, enabled: unknown) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled === true })
    return autostartState()
  })

  ipcMain.handle('logs:open', async () => {
    await shell.openPath(logsFolder())
  })
}
