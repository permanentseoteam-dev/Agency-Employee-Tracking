// Pure helpers for the Project tab. Each person's status comes from the server
// (GET /api/projects/status, server/pb_hooks/lib/projects.js); these count and order it.
import type { AttendanceStatus } from './attendance'

/** A stored attendance status, "not_in_yet" (today, before anyone starts), or '' (not employed / not counted yet). */
export type TeamStatus = AttendanceStatus | 'not_in_yet' | ''

export type CountedStatus = 'present' | 'late' | 'half_day' | 'absent' | 'on_leave'

export interface MemberStatus {
  user: string
  status: TeamStatus
  month: Record<CountedStatus, number>
}

export interface TeamStatusResponse {
  date: string
  today: boolean
  members: MemberStatus[]
}

export const TEAM_STATUS_LABEL: Record<TeamStatus, string> = {
  present: 'Present',
  late: 'Late',
  half_day: 'Half day',
  absent: 'Absent',
  on_leave: 'On leave',
  holiday: 'Holiday',
  weekend: 'Weekend',
  not_in_yet: 'Not in yet',
  '': '—'
}

/** Row order: who is in first, then who isn't, then days off. */
const ORDER: TeamStatus[] = ['present', 'late', 'half_day', 'not_in_yet', 'absent', 'on_leave', 'holiday', 'weekend', '']

/** The status chips above the table; "Not in yet" only exists for today. */
export function chipStatuses(today: boolean): TeamStatus[] {
  const base: TeamStatus[] = ['present', 'late', 'half_day', 'absent', 'on_leave']
  return today ? [...base, 'not_in_yet'] : base
}

export function countStatuses(rows: { status: TeamStatus }[]): Record<TeamStatus, number> {
  const out = Object.fromEntries(ORDER.map((s) => [s, 0])) as Record<TeamStatus, number>
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1
  return out
}

export function sortByStatus<T extends { status: TeamStatus; name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name))
}
