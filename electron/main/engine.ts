// Runs the tracker (plan §4.1): polls powerMonitor every 15 s, feeds the state
// machine, queues the closed segments, keeps today's totals and the presence
// heartbeat. All decisions about time live in tracker.ts.
import { powerMonitor } from 'electron'
import { dayRangeUtc, toDateKey } from '../../src/lib/dates'
import type { TrackerSettings, TrackerStatus } from '../preload/api'
import { log } from './log'
import { db, expire, identity, isSignedIn, onSessionChange, refresh } from './session'
import { DEFAULT_SETTINGS, persisted, type DayTotals } from './store'
import { SyncQueue } from './syncQueue'
import { inShift, POLL_MS, TrackerMachine, type Segment } from './tracker'

const HEARTBEAT_MS = 60_000
/**
 * Today's server segments are read again this often (and shortly after the queue sends
 * something), so time recorded on another PC after this app signed in shows up in today's
 * totals. remember() de-duplicates by id, so reading the same rows again never double counts.
 */
const SERVER_TOTALS_MS = 10 * 60_000
/** Wait this long after a segment reaches the server, so one flush of many segments reads once. */
const AFTER_SYNC_MS = 5_000

const machine = new TrackerMachine()
let pollTimer: ReturnType<typeof setInterval> | null = null
let serverTotalsTimer: ReturnType<typeof setInterval> | null = null
let afterSyncTimer: ReturnType<typeof setTimeout> | null = null
/** The user whose segment is open in the machine. */
let trackingUser: string | null = null
let paused: 'locked' | 'suspended' | null = null
const statusListeners = new Set<(s: TrackerStatus) => void>()
let lastStatusJson = ''

export const queue = new SyncQueue({
  storage: {
    load: () => persisted().get('queue'),
    save: (items) => persisted().set('queue', items)
  },
  client: () => {
    const id = identity()
    if (!id || !isSignedIn()) return null
    return {
      userId: id.userId,
      create: async (item) => {
        const { error, status } = await db.from('activity_segments').insert(item)
        // The shape classify() reads: status, plus Postgres's code and the guard's hint.
        if (error) throw { status, code: error.code, hint: error.hint ?? '', message: error.message }
        refreshTodaySoon()
      }
    }
  },
  verifySession: () => refresh(),
  onAuthLost: () => expire(),
  log
})

export function settings(): TrackerSettings {
  return persisted().get('settings') ?? DEFAULT_SETTINGS
}

// ---- today's totals --------------------------------------------------------
// Every segment seen today, by id: closed here, or already on the server
// (recorded on another day's run of the app). Summing by id never double counts.

function todayTotals(userId: string): DayTotals {
  const date = toDateKey(Date.now(), settings().timezone)
  const t = persisted().get('today')
  if (t && t.userId === userId && t.date === date) return t
  return { userId, date, seen: {} }
}

function remember(userId: string, entries: { id: string; state: 'active' | 'idle'; seconds: number; startedAt: number }[]): void {
  const t = todayTotals(userId)
  const tz = settings().timezone
  let changed = false
  for (const e of entries) {
    if (toDateKey(e.startedAt, tz) !== t.date || t.seen[e.id]) continue
    t.seen[e.id] = { s: e.state, d: e.seconds }
    changed = true
  }
  if (changed || persisted().get('today')?.date !== t.date) persisted().set('today', t)
}

/** Adds what the server already has for today (e.g. after a reinstall or a sign-in on this PC). */
async function loadTodayFromServer(userId: string): Promise<void> {
  const { start } = dayRangeUtc(toDateKey(Date.now(), settings().timezone), settings().timezone)
  try {
    const { data, error } = await db
      .from('activity_segments')
      .select('id, state, started_at, ended_at')
      .eq('user', userId)
      .gte('started_at', new Date(start).toISOString())
    if (error) throw new Error(error.message)
    // Signed out or someone else signed in while waiting: these rows are not theirs.
    if (identity()?.userId !== userId) return
    const rows = data ?? []
    remember(
      userId,
      rows.map((r) => {
        const s = Date.parse(r.started_at.replace(' ', 'T'))
        return { id: r.id, state: r.state, startedAt: s, seconds: Math.round((Date.parse(r.ended_at.replace(' ', 'T')) - s) / 1000) }
      })
    )
    pushStatus()
  } catch (err) {
    log.warn('could not load today’s totals from the server:', (err as Error).message)
  }
}

/** Re-reads today's server segments for whoever is signed in now. */
function refreshTodayFromServer(): void {
  const id = identity()
  if (id && isSignedIn()) void loadTodayFromServer(id.userId)
}

/** After the queue sends segments: read today's server totals once it has settled. */
function refreshTodaySoon(): void {
  if (afterSyncTimer) clearTimeout(afterSyncTimer)
  afterSyncTimer = setTimeout(() => {
    afterSyncTimer = null
    refreshTodayFromServer()
  }, AFTER_SYNC_MS)
  afterSyncTimer.unref?.()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * After the switch from PocketBase, time this PC recorded before the person signed in again
 * still carries their old PocketBase id. It moves to them only if their profile holds that old
 * id (profiles.legacy_id, set by the migration), so on a shared PC nobody gets someone else's time.
 */
async function adoptTimeFromBeforeTheSwitch(userId: string): Promise<void> {
  const t = persisted().get('today')
  const old = new Set(queue.pending().map((i) => i.user).filter((u) => !UUID.test(u)))
  if (t && !UUID.test(t.userId)) old.add(t.userId)
  if (!old.size) return
  const { data, error } = await db.from('profiles').select('legacy_id').eq('id', userId).maybeSingle()
  if (error || !data?.legacy_id || !old.has(data.legacy_id)) return
  const moved = queue.reassign(data.legacy_id, userId)
  // Read today's totals again: the open segment was closed (and counted) while we waited.
  const latest = persisted().get('today')
  if (latest && latest.userId === data.legacy_id) persisted().set('today', { ...latest, userId })
  log.info(`moved ${moved} segment(s) recorded before the switch to Supabase to this account`)
  pushStatus()
}

export function today(): { date: string; active_s: number; idle_s: number } {
  const id = identity()
  const date = toDateKey(Date.now(), settings().timezone)
  if (!id) return { date, active_s: 0, idle_s: 0 }
  const t = todayTotals(id.userId)
  let active = 0
  let idle = 0
  for (const v of Object.values(t.seen)) {
    if (v.s === 'active') active += v.d
    else idle += v.d
  }
  if (trackingUser === id.userId) {
    const open = machine.openSeconds(Date.now())
    if (open?.state === 'active') active += open.seconds
    if (open?.state === 'idle') idle += open.seconds
  }
  return { date, active_s: active, idle_s: idle }
}

// ---- recording ---------------------------------------------------------------

function record(segments: Segment[], userId: string | null): void {
  if (!userId || segments.length === 0) return
  const added = segments.map((s) => ({
    seg: s,
    item: queue.add({
      user: userId,
      state: s.state,
      started_at: new Date(s.startedAt).toISOString(),
      ended_at: new Date(s.endedAt).toISOString()
    })
  }))
  remember(
    userId,
    added.map(({ seg, item }) => ({
      id: item.id,
      state: seg.state,
      startedAt: seg.startedAt,
      seconds: Math.round((seg.endedAt - seg.startedAt) / 1000)
    }))
  )
}

function idleSeconds(): number {
  try {
    return powerMonitor.getSystemIdleTime()
  } catch {
    return 0
  }
}

/** Closes the open segment, if any (lock, suspend, sign-in as someone else, quit). */
function closeOpen(): void {
  const before = machine.state
  record(machine.stop(Date.now(), idleSeconds(), settings()), trackingUser)
  if (before) log.info(`tracking: ${before} → stopped`)
}

function canTrack(): boolean {
  const id = identity()
  return !!id && id.consented && !paused
}

function poll(): void {
  const id = identity()
  if (trackingUser && trackingUser !== id?.userId) closeOpen()
  trackingUser = id?.userId ?? null

  if (canTrack()) {
    const before = machine.state
    record(machine.tick(Date.now(), idleSeconds(), settings()), trackingUser)
    if (machine.state !== before) log.info(`tracking: ${before ?? 'stopped'} → ${machine.state ?? 'stopped (outside shift)'}`)
  } else if (machine.state) {
    closeOpen()
  }
  void heartbeat()
  pushStatus()
}

// ---- presence heartbeat ------------------------------------------------------

let lastBeat: { status: string; at: number } | null = null

function presenceStatus(): 'active' | 'idle' | 'offline' {
  // A locked PC counts as idle only during the shift; after hours or on days off it is offline,
  // so the Live Board doesn't show someone as idle all night or all weekend.
  if (paused === 'locked') return identity()?.consented && inShift(Date.now(), settings()) ? 'idle' : 'offline'
  if (!canTrack() || !machine.state) return 'offline'
  return machine.state
}

async function heartbeat(force = false): Promise<void> {
  const id = identity()
  if (!id || !isSignedIn()) return
  const status = presenceStatus()
  const now = Date.now()
  if (!force && lastBeat?.status === status && (status === 'offline' || now - lastBeat.at < HEARTBEAT_MS)) return
  lastBeat = { status, at: now }

  const t = today()
  const data = { status, last_seen: new Date(now).toISOString(), today_active_s: t.active_s, today_idle_s: t.idle_s }
  // One row per person (unique on "user"): insert the first time, update after that.
  const { error, status: code } = await db.from('presence').upsert({ user: id.userId, ...data }, { onConflict: 'user' })
  if (error) {
    lastBeat = null // send again on the next poll
    if (code === 401) expire()
  }
}

// ---- status for the tray and the renderer -----------------------------------

export function status(): TrackerStatus {
  const id = identity()
  let reason: TrackerStatus['reason'] = 'tracking'
  if (!id) reason = 'no_user'
  else if (!id.consented) reason = 'no_consent'
  else if (paused) reason = paused
  else if (!machine.state) reason = inShift(Date.now(), settings()) ? 'starting' : 'outside_shift'
  return {
    state: reason === 'tracking' ? (machine.state ?? 'active') : 'off',
    reason,
    signedIn: isSignedIn(),
    role: id?.role ?? '',
    pending: id ? queue.pending(id.userId).length : 0,
    today: today()
  }
}

export function onStatus(fn: (s: TrackerStatus) => void): () => void {
  statusListeners.add(fn)
  return () => statusListeners.delete(fn)
}

function pushStatus(): void {
  const s = status()
  const json = JSON.stringify(s)
  if (json === lastStatusJson) return
  lastStatusJson = json
  for (const fn of statusListeners) fn(s)
}

// ---- lifecycle ---------------------------------------------------------------

export function startEngine(): void {
  powerMonitor.on('lock-screen', () => {
    closeOpen()
    paused = 'locked'
    void heartbeat(true)
    pushStatus()
  })
  powerMonitor.on('unlock-screen', () => {
    paused = null
    poll()
  })
  powerMonitor.on('suspend', () => {
    closeOpen()
    paused = 'suspended'
    pushStatus()
  })
  powerMonitor.on('resume', () => {
    paused = null
    poll()
    void queue.flush()
  })

  let lastSignedInUser: string | null = null
  onSessionChange(() => {
    const id = identity()
    const user = isSignedIn() ? (id?.userId ?? null) : null
    if (user && user !== lastSignedInUser) {
      void adoptTimeFromBeforeTheSwitch(user)
        .catch((err) => log.warn('could not check for time from before the switch:', (err as Error).message))
        .finally(() => loadTodayFromServer(user))
      void queue.flush()
      lastBeat = null
    }
    lastSignedInUser = user
    poll()
  })
  queue.onChange(pushStatus)

  pollTimer = setInterval(poll, POLL_MS)
  serverTotalsTimer = setInterval(refreshTodayFromServer, SERVER_TOTALS_MS)
  poll()
  log.info(`tracker started (${queue.pending().length} segment(s) waiting to sync)`)
}

/** Windows is ending the session: close the open segment on disk right away (synchronous). */
export function stopNow(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  if (serverTotalsTimer) clearInterval(serverTotalsTimer)
  serverTotalsTimer = null
  if (afterSyncTimer) clearTimeout(afterSyncTimer)
  afterSyncTimer = null
  closeOpen()
}

/** Quit: close the open segment, then give the queue and presence a moment to reach the server. */
export async function shutdown(timeoutMs = 3000): Promise<void> {
  stopNow()
  const wait = new Promise((r) => setTimeout(r, timeoutMs))
  await Promise.race([Promise.all([queue.flush(), heartbeat(true)]), wait])
}
