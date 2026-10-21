import { BrowserWindow, ipcMain, shell } from 'electron'
import type { SessionInfo, TrackerSettings } from '../preload/api'
import { autostartState, ensureAutostart, setAutostart } from './autostart'
import { clearLogin, loadLogin, saveLogin } from './credentials'
import { onStatus, status, today } from './engine'
import { log, logsFolder } from './log'
import { networkStatus } from './network'
import { onSessionExpired, setFromRenderer } from './session'
import { persisted } from './store'
import { trayModel } from './trayMenu'

function sanitizeSession(raw: unknown): SessionInfo | null {
  const s = raw as Partial<SessionInfo> | null
  if (!s || typeof s.token !== 'string' || typeof s.userId !== 'string') return null
  return { token: s.token, userId: s.userId, role: String(s.role ?? 'employee'), consented: s.consented === true }
}

function sanitizeSettings(raw: unknown): TrackerSettings | null {
  const s = raw as Partial<TrackerSettings> | null
  if (!s || typeof s.shift_start !== 'string' || typeof s.shift_end !== 'string') return null
  if (!Array.isArray(s.work_days) || typeof s.idle_threshold_minutes !== 'number') return null
  return {
    shift_start: s.shift_start,
    shift_end: s.shift_end,
    work_days: s.work_days.filter((d): d is number => Number.isInteger(d)),
    idle_threshold_minutes: s.idle_threshold_minutes,
    timezone: typeof s.timezone === 'string' && s.timezone ? s.timezone : 'Asia/Karachi'
  }
}

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

export function registerIpc(handlers: { quit(): void }): void {
  // Quit from the window follows the tray's rule, checked here from the main process's
  // own session, never from what the renderer claims.
  ipcMain.handle('app:quit', () => {
    if (!trayModel(status()).canQuit) {
      log.warn('quit refused: this user may not stop the tracker')
      return false
    }
    handlers.quit()
    return true
  })

  ipcMain.handle('network:status', () => networkStatus())

  // Sign-in screen: Remember me keeps the sign-in (the password is encrypted by Windows, see credentials.ts).
  ipcMain.handle('login:load', () => loadLogin())
  ipcMain.handle('login:save', (_event, email: unknown, password: unknown) =>
    typeof email === 'string' && typeof password === 'string' && email.length <= 320 && password.length <= 200 ? saveLogin(email, password) : undefined
  )
  ipcMain.handle('login:clear', () => clearLogin())

  ipcMain.on('log:renderer-error', (_event, message: unknown) => {
    log.error('[renderer]', String(message))
  })
  // Sign-in events from the renderer (event names and reasons only, never tokens).
  ipcMain.on('log:renderer-info', (_event, message: unknown) => {
    log.info('[renderer]', String(message).slice(0, 300))
  })

  ipcMain.on('session:set', (_event, raw: unknown) => {
    setFromRenderer(sanitizeSession(raw))
    ensureAutostart()
  })

  ipcMain.on('settings:set', (_event, raw: unknown) => {
    const next = sanitizeSettings(raw)
    if (!next) return
    const before = JSON.stringify(persisted().get('settings'))
    if (before === JSON.stringify(next)) return
    persisted().set('settings', next)
    log.info(
      `rules: shift ${next.shift_start}-${next.shift_end}, days [${next.work_days.join(',')}], ` +
        `idle after ${next.idle_threshold_minutes} min`
    )
  })

  ipcMain.handle('tracker:today', () => today())
  ipcMain.handle('tracker:status', () => status())
  onStatus((s) => broadcast('tracker:status', s))
  onSessionExpired(() => broadcast('session:expired'))

  ipcMain.handle('autostart:get', () => autostartState())
  ipcMain.handle('autostart:set', (_event, enabled: unknown) => setAutostart(enabled === true))

  ipcMain.handle('logs:open', async () => {
    await shell.openPath(logsFolder())
  })
}
