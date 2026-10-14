// Pure helpers for the tracking screens (My Stats, Live Board, Reports).
import { toCsv } from './csv'
import { addDays, isoWeekday, toDateKey, DEFAULT_TZ } from './dates'
import { formatDuration } from './format'

/** No heartbeat for longer than this means Offline (plan §4.1). */
export const OFFLINE_AFTER_MS = 2 * 60_000

export type LiveStatus = 'active' | 'idle' | 'offline'

export interface PresenceRecord {
  id: string
  user: string
  status: LiveStatus
  last_seen: string
  today_active_s: number
  today_idle_s: number
}

function instant(value: string): number {
  return value ? Date.parse(value.replace(' ', 'T')) : NaN
}

/** What the board shows: the reported status, or Offline when the heartbeat is stale. */
export function liveStatus(p: PresenceRecord | undefined, now: number): LiveStatus {
  if (!p) return 'offline'
  const seen = instant(p.last_seen)
  if (!Number.isFinite(seen) || now - seen > OFFLINE_AFTER_MS) return 'offline'
  return p.status
}

/** Today's totals from a presence record; zero when the last heartbeat was on an earlier day. */
export function presenceToday(p: PresenceRecord | undefined, now: number, tz = DEFAULT_TZ): { active_s: number; idle_s: number } {
  const seen = p ? instant(p.last_seen) : NaN
  if (!p || !Number.isFinite(seen) || toDateKey(seen, tz) !== toDateKey(now, tz)) return { active_s: 0, idle_s: 0 }
  return { active_s: p.today_active_s || 0, idle_s: p.today_idle_s || 0 }
}

/** Monday to Sunday of the week containing the day. */
export function weekOf(dateKey: string): string[] {
  const monday = addDays(dateKey, 1 - isoWeekday(dateKey))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export interface SegmentRow {
  state: 'active' | 'idle'
  started_at: string
  ended_at: string
}

/** Active and idle seconds per local day. */
export function totalsByDay(segments: SegmentRow[], tz = DEFAULT_TZ): Record<string, { active_s: number; idle_s: number }> {
  const out: Record<string, { active_s: number; idle_s: number }> = {}
  for (const s of segments) {
    const start = instant(s.started_at)
    const seconds = Math.max(0, Math.round((instant(s.ended_at) - start) / 1000))
    if (!Number.isFinite(seconds)) continue
    const day = (out[toDateKey(start, tz)] ??= { active_s: 0, idle_s: 0 })
    if (s.state === 'active') day.active_s += seconds
    else day.idle_s += seconds
  }
  return out
}

export interface ReportRow {
  user: string
  full_name: string
  team: string
  /** "YYYY-MM-DD" (day, or the Monday of a week) or "YYYY-MM" (month). */
  period: string
  active_s: number
  idle_s: number
}

export function reportTotals(rows: ReportRow[]): { active_s: number; idle_s: number } {
  return rows.reduce((t, r) => ({ active_s: t.active_s + r.active_s, idle_s: t.idle_s + r.idle_s }), { active_s: 0, idle_s: 0 })
}

/** Hours with two decimals, for spreadsheets. */
export function decimalHours(seconds: number): string {
  return (seconds / 3600).toFixed(2)
}

/** The report exactly as shown on screen, plus decimal hours and a total line. */
export function reportCsv(rows: ReportRow[], periodLabel: string): string {
  const header = ['Employee', 'Team', periodLabel, 'Active', 'Idle', 'Active hours', 'Idle hours']
  const lines = rows.map((r) => [
    r.full_name,
    r.team,
    r.period,
    formatDuration(r.active_s),
    formatDuration(r.idle_s),
    decimalHours(r.active_s),
    decimalHours(r.idle_s)
  ])
  const t = reportTotals(rows)
  lines.push(['Total', '', '', formatDuration(t.active_s), formatDuration(t.idle_s), decimalHours(t.active_s), decimalHours(t.idle_s)])
  return toCsv([header, ...lines])
}
