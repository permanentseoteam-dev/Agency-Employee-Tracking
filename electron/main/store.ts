// The main process's own state on disk (%APPDATA%\PSEO Tracker\tracker.json).
// Written synchronously, so nothing is lost if Windows shuts the app down.
import Store from 'electron-store'
import type { TrackerSettings } from '../preload/api'
import type { QueuedSegment } from './syncQueue'

/** Who the tracker records time for. Kept after sign-out so tracking never stops (no token is stored). */
export interface Identity {
  userId: string
  role: string
  consented: boolean
}

/** Today's closed segments for one user, by segment id: state and seconds. */
export interface DayTotals {
  userId: string
  date: string
  seen: Record<string, { s: 'active' | 'idle'; d: number }>
}

interface Persisted {
  identity: Identity | null
  settings: TrackerSettings | null
  queue: QueuedSegment[]
  today: DayTotals | null
  autostartInitialized: boolean
  /** The app version that last ran here, to announce an update once (updater.ts). */
  lastVersion: string | null
  /** Set just before an automatic update: whether the window was open, so the restarted app matches. */
  showWindowAfterUpdate: boolean | null
}

let store: Store<Persisted> | null = null

export function persisted(): Store<Persisted> {
  store ??= new Store<Persisted>({
    name: 'tracker',
    defaults: { identity: null, settings: null, queue: [], today: null, autostartInitialized: false, lastVersion: null, showWindowAfterUpdate: null }
  })
  return store
}

/** The seed defaults, used until the renderer has handed over the org rules once. */
export const DEFAULT_SETTINGS: TrackerSettings = {
  shift_start: '09:00',
  shift_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  idle_threshold_minutes: 5,
  timezone: 'Asia/Karachi'
}
