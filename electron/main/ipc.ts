import { app, ipcMain, shell } from 'electron'
import type { AutostartState, SessionInfo, TrackerSettings } from '../preload/api'
import { log, logsFolder } from './log'

let session: SessionInfo | null = null
let settings: TrackerSettings | null = null

/** The signed-in user, handed over by the renderer. The tracker (M5) writes as this user. */
export function currentSession(): SessionInfo | null {
  return session
}

/** The org rules, kept current by the renderer (including live changes by an admin). */
export function currentSettings(): TrackerSettings | null {
  return settings
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
    timezone: typeof s.timezone === 'string' ? s.timezone : 'Asia/Karachi'
  }
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

  ipcMain.on('settings:set', (_event, raw: unknown) => {
    const next = sanitizeSettings(raw)
    if (!next) return
    const before = JSON.stringify(settings)
    settings = next
    if (before !== JSON.stringify(next)) {
      log.info(
        `rules: shift ${next.shift_start}-${next.shift_end}, days [${next.work_days.join(',')}], ` +
          `idle after ${next.idle_threshold_minutes} min`
      )
    }
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
