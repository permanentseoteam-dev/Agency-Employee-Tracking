// Pure helpers for the attendance screens (plan §4.2). The statuses themselves
// are decided on the server (shared/logic/attendance.js).
import { addDays } from './dates'

export type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent' | 'on_leave' | 'holiday' | 'weekend'

export interface AttendanceRecord {
  id: string
  user: string
  date: string
  status: AttendanceStatus
  first_activity_at: string
  last_activity_at: string
  active_s: number
  idle_s: number
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  half_day: 'Half day',
  absent: 'Absent',
  on_leave: 'On leave',
  holiday: 'Holiday',
  weekend: 'Weekend'
}

/** One- or two-character codes for the grid. */
export const STATUS_CODE: Record<AttendanceStatus, string> = {
  present: 'P',
  late: 'L',
  half_day: '½',
  absent: 'A',
  on_leave: 'LV',
  holiday: 'H',
  weekend: ''
}

/** The statuses that are counted in totals, in display order. */
export const COUNTED: AttendanceStatus[] = ['present', 'late', 'half_day', 'absent', 'on_leave']

/** "2026-10" for a day key. */
export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7)
}

/** Moves a "YYYY-MM" month by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Every day of a "YYYY-MM" month. */
export function monthDays(month: string): string[] {
  const days: string[] = []
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) days.push(d)
  return days
}

/** "October 2026". */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))
}

/** How many days of each counted status. */
export function countStatuses(records: Pick<AttendanceRecord, 'status'>[]): Record<AttendanceStatus, number> {
  const counts = { present: 0, late: 0, half_day: 0, absent: 0, on_leave: 0, holiday: 0, weekend: 0 }
  for (const r of records) counts[r.status]++
  return counts
}

/** The finished days of a month that can be recounted (up to yesterday), or null when none has finished. */
export function recomputeRange(month: string, today: string): { from: string; to: string } | null {
  const days = monthDays(month)
  const yesterday = addDays(today, -1)
  if (days[0] > yesterday) return null
  return { from: days[0], to: days[days.length - 1] < yesterday ? days[days.length - 1] : yesterday }
}

/** Whether a person can have a record on the day (between joining and leaving). */
export function employedOn(day: string, person: { joined_on?: string; left_on?: string }): boolean {
  return !(person.joined_on && day < person.joined_on) && !(person.left_on && day > person.left_on)
}
