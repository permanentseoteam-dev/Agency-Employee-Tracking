// Start at Windows login (plan §4.1). Employees always have it on; managers
// and admins get it on once and may turn it off in Settings.
import { app } from 'electron'
import type { AutostartState } from '../preload/api'
import { identity } from './session'
import { persisted } from './store'

/** Started by Windows at login: go straight to the tray. */
export const HIDDEN_ARG = '--hidden'

function locked(): boolean {
  return (identity()?.role ?? 'employee') === 'employee'
}

export function autostartState(): AutostartState {
  if (!app.isPackaged) return { supported: false, enabled: false, locked: false }
  return { supported: true, enabled: app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin, locked: locked() }
}

function apply(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] })
}

/** At startup and on every sign-in. */
export function ensureAutostart(): void {
  if (!app.isPackaged) return
  const store = persisted()
  if (locked() || !store.get('autostartInitialized')) {
    if (!app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin) apply(true)
    store.set('autostartInitialized', true)
  }
}

export function setAutostart(enabled: boolean): AutostartState {
  if (app.isPackaged && !(locked() && !enabled)) apply(enabled)
  return autostartState()
}
