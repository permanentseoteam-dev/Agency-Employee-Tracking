// Pure helpers for the tracking screens (My Stats, Live Board, Reports).
import { toCsv } from './csv'
import { addDays, isoWeekday, toDateKey, zonedTimeToUtc, DEFAULT_TZ } from './dates'
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

/** What a board card shows: the live status, plus On leave for someone offline with approved leave today. */
export type BoardStatus = LiveStatus | 'on_leave'

/** Someone working despite approved leave still shows Active or Idle; only when offline does leave show. */
export function boardStatus(p: PresenceRecord | undefined, now: number, onLeaveToday: boolean): BoardStatus {
  const status = liveStatus(p, now)
  return status === 'offline' && onLeaveToday ? 'on_leave' : status
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

/** The month containing the day, split into Monday–Sunday weeks clipped to the month. */
export function monthWeeks(dateKey: string): { from: string; to: string }[] {
  const month = dateKey.slice(0, 7)
  const out: { from: string; to: string }[] = []
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) {
    if (!out.length || isoWeekday(d) === 1) out.push({ from: d, to: d })
    else out[out.length - 1].to = d
  }
  return out
}

/** Active and idle seconds from–to (inclusive) out of totalsByDay. */
export function sumDays(byDay: Record<string, { active_s: number; idle_s: number }>, from: string, to: string): { active_s: number; idle_s: number } {
  const sum = { active_s: 0, idle_s: 0 }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    sum.active_s += byDay[d]?.active_s ?? 0
    sum.idle_s += byDay[d]?.idle_s ?? 0
  }
  return sum
}

export interface SegmentRow {
  state: 'active' | 'idle'
  started_at: string
  ended_at: string
}

/** The office-hours rules overtime is measured against. */
export interface ShiftRules {
  shift_start: string
  shift_end: string
  work_days: number[]
  timezone: string
}

/**
 * Overtime per local day: active seconds recorded outside office hours (before the shift
 * starts, after it ends, or on a day off: a non-working weekday or a holiday). Idle time is
 * not overtime. Segments are a few minutes long and belong to the day they start on.
 */
export function overtimeByDay(segments: SegmentRow[], rules: ShiftRules, holidays: ReadonlySet<string> = new Set()): Record<string, number> {
  const out: Record<string, number> = {}
  const shifts = new Map<string, { start: number; end: number } | null>()
  const shiftOf = (day: string) => {
    if (!shifts.has(day)) {
      const workDay = rules.work_days.includes(isoWeekday(day)) && !holidays.has(day)
      shifts.set(
        day,
        workDay ? { start: zonedTimeToUtc(day, rules.shift_start, rules.timezone).getTime(), end: zonedTimeToUtc(day, rules.shift_end, rules.timezone).getTime() } : null
      )
    }
    return shifts.get(day)!
  }
  for (const seg of segments) {
    if (seg.state !== 'active') continue
    const start = instant(seg.started_at)
    const end = instant(seg.ended_at)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const day = toDateKey(start, rules.timezone)
    const shift = shiftOf(day)
    const inside = shift ? Math.max(0, Math.min(end, shift.end) - Math.max(start, shift.start)) : 0
    const extra = Math.round((end - start - inside) / 1000)
    if (extra > 0) out[day] = (out[day] ?? 0) + extra
  }
  return out
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
