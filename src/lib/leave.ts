// Pure helpers for leave (plan §4.3). The server (server/pb_hooks/lib/leave.js) has
// the final say; these mirror its rules so the Apply form can preview the days and
// show problems before sending, and the Approvals queue can offer only valid moves.
import { addDays, isoWeekday } from './dates'
import { isDateKey } from './holidays'
import type { Role } from './db'

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveTypeInfo {
  id: string
  name: string
  yearly_quota_days: number
  paid: boolean
}

export interface LeaveRequest {
  id: string
  user: string
  leave_type: string
  start_date: string
  end_date: string
  half_day: boolean
  days: number
  reason: string
  status: LeaveStatus
  approver: string
  decided_at: string
  comment: string
  created: string
  expand?: {
    user?: { id: string; full_name: string; team: string; role: Role }
    leave_type?: LeaveTypeInfo
    approver?: { id: string; full_name: string }
  }
}

/** A row of the leave_balances view: this year's quota minus approved days. */
export interface LeaveBalance {
  id: string
  user: string
  leave_type: string
  quota: number
  used: number
  remaining: number
}

export interface LeaveInput {
  leave_type: string
  start_date: string
  end_date: string
  half_day: boolean
  reason: string
}

/** The longest request, in calendar days (same as the server). */
export const MAX_RANGE_DAYS = 60

const STAFF: Role[] = ['manager', 'admin']

/** Every day from–to, inclusive (capped a little past MAX_RANGE_DAYS). */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d)
  return out
}

/** Days a request counts: its working days (work weekdays, not holidays), or 0.5 for a half day on a working day. */
export function countLeaveDays(start: string, end: string, halfDay: boolean, workDays: number[], holidays: Set<string>): number {
  if (!isDateKey(start) || !isDateKey(end) || end < start) return 0
  const n = daysBetween(start, end).filter((d) => workDays.includes(isoWeekday(d)) && !holidays.has(d)).length
  return halfDay ? (n > 0 ? 0.5 : 0) : n
}

/** "1 day", "4 days", "0.5 day". */
export function formatDays(days: number): string {
  return `${days} day${days === 1 || days === 0.5 ? '' : 's'}`
}

/** True when the request still counts: approved, or pending (quota and overlap treat both as taken). */
export function isActive(r: Pick<LeaveRequest, 'status'>): boolean {
  return r.status === 'pending' || r.status === 'approved'
}

export interface LeaveContext {
  workDays: number[]
  holidays: Set<string>
  types: LeaveTypeInfo[]
  /** The person's own requests (any status); used for overlap, quota and the monthly limits. */
  mine: (Pick<LeaveRequest, 'id' | 'leave_type' | 'start_date' | 'end_date' | 'days' | 'status'> & { half_day?: boolean })[]
  joinedOn?: string
  leftOn?: string
  /** Leave per month from Rules (org_settings.monthly_full_leaves / monthly_half_leaves); 0 = no limit. */
  limits?: MonthUse
}

export type LeaveErrors = Partial<Record<keyof LeaveInput, string>>

/** Checks the Apply form the way the server will. Returns the errors and the days it counts. */
export function validateLeave(input: LeaveInput, ctx: LeaveContext): { errors: LeaveErrors; days: number } {
  const errors: LeaveErrors = {}
  const { start_date: start, end_date: end, half_day: halfDay } = input
  const type = ctx.types.find((t) => t.id === input.leave_type)
  if (!type) errors.leave_type = 'Pick a leave type.'
  if (input.reason.length > 1000) errors.reason = 'Keep the reason under 1000 characters.'

  if (!isDateKey(start)) errors.start_date = 'Pick a valid start date.'
  else if (!isDateKey(end)) errors.end_date = 'Pick a valid end date.'
  else if (end < start) errors.end_date = 'The end date must be on or after the start date.'
  else if (start.slice(0, 4) !== end.slice(0, 4))
    errors.end_date = 'Leave can’t run across the new year. Send one request up to 31 Dec and another from 1 Jan.'
  else if (daysBetween(start, end).length > MAX_RANGE_DAYS) errors.end_date = `A request can cover at most ${MAX_RANGE_DAYS} days.`
  else if (halfDay && start !== end) errors.half_day = 'A half day must start and end on the same day.'
  else if (ctx.joinedOn && start < ctx.joinedOn) errors.start_date = `Leave can’t start before your joining date (${ctx.joinedOn}).`
  else if (ctx.leftOn && end > ctx.leftOn) errors.end_date = `Leave can’t go past your leaving date (${ctx.leftOn}).`

  const dateProblem = errors.start_date || errors.end_date || errors.half_day
  const days = dateProblem ? 0 : countLeaveDays(start, end, halfDay, ctx.workDays, ctx.holidays)
  if (!dateProblem && days === 0) {
    errors.end_date = halfDay ? 'That day isn’t a working day.' : 'There are no working days in these dates (only weekends or holidays).'
  }

  if (!errors.start_date && !errors.end_date && !errors.half_day) {
    const other = ctx.mine.find((r) => isActive(r) && r.start_date <= end && r.end_date >= start)
    if (other) errors.start_date = `These dates overlap your ${other.status} leave (${other.start_date} – ${other.end_date}).`
  }

  if (type && type.paid && days > 0 && !errors.start_date && !errors.end_date) {
    const left = quotaLeft(type, ctx.mine, start.slice(0, 4))
    if (days > left + 1e-9) {
      errors.leave_type =
        left <= 0
          ? `No ${type.name} leave left this year (quota ${type.yearly_quota_days} days).`
          : `Only ${formatDays(left)} of ${type.name} leave left this year; this request needs ${days}.`
    }
  }

  if (ctx.limits && days > 0 && !errors.start_date && !errors.end_date && !errors.half_day) {
    const adding = leaveByMonth(start, end, halfDay, ctx.workDays, ctx.holidays)
    for (const month of Object.keys(adding).sort()) {
      const problem = monthlyLimitProblem(ctx.limits, month, monthUse(ctx.mine, month, ctx.workDays, ctx.holidays), adding[month])
      if (problem) {
        if (halfDay) errors.half_day = problem
        else errors.end_date = problem
        break
      }
    }
  }
  return { errors, days }
}

/** Leave in one month for the monthly limits: full = working days, half = half-day (short) leaves. */
export interface MonthUse {
  full: number
  half: number
}

/** A request's leave per month ("YYYY-MM" → use); a request may run into the next month. */
export function leaveByMonth(start: string, end: string, halfDay: boolean, workDays: number[], holidays: Set<string>): Record<string, MonthUse> {
  const out: Record<string, MonthUse> = {}
  if (!isDateKey(start) || !isDateKey(end) || end < start) return out
  const working = daysBetween(start, halfDay ? start : end).filter((d) => workDays.includes(isoWeekday(d)) && !holidays.has(d))
  for (const d of working) {
    const m = (out[d.slice(0, 7)] ??= { full: 0, half: 0 })
    if (halfDay) m.half = 1
    else m.full++
  }
  return out
}

/** What the person's approved and pending requests already use in a month. */
export function monthUse(mine: LeaveContext['mine'], month: string, workDays: number[], holidays: Set<string>): MonthUse {
  const use = { full: 0, half: 0 }
  for (const r of mine) {
    if (!isActive(r)) continue
    const m = leaveByMonth(r.start_date, r.end_date, !!r.half_day, workDays, holidays)[month]
    if (m) {
      use.full += m.full
      use.half += m.half
    }
  }
  return use
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Why a request goes over a monthly limit (the server's wording), or null. limits: 0 = no limit. */
export function monthlyLimitProblem(limits: MonthUse, month: string, taken: MonthUse, adding: MonthUse): string | null {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month
  const check = (max: number, used: number, add: number, kind: string, one: string, many: string) => {
    if (!(max > 0) || !(add > 0) || used + add <= max) return null
    const left = Math.max(0, max - used)
    const rule = ` (limit ${max} a month)`
    if (left === 0) return `No ${kind} leave left in ${name}${rule}.`
    return `Only ${left} ${left === 1 ? one : many} of leave left in ${name}${rule}; this request needs ${add}.`
  }
  return (
    check(limits.full, taken.full, adding.full, 'full-day', 'full day', 'full days') ??
    check(limits.half, taken.half, adding.half, 'half-day (short)', 'half day', 'half days')
  )
}

/** Paid days still available in a year: quota − (approved + pending). Unpaid types have no limit. */
export function quotaLeft(type: LeaveTypeInfo, mine: LeaveContext['mine'], year: string): number {
  if (!type.paid) return Infinity
  const taken = mine
    .filter((r) => r.leave_type === type.id && isActive(r) && r.start_date.startsWith(`${year}-`))
    .reduce((sum, r) => sum + r.days, 0)
  return Math.round((type.yearly_quota_days - taken) * 10) / 10
}

export interface BalanceRow {
  type: LeaveTypeInfo
  quota: number | null
  used: number
  pending: number
  /** What can still be asked for (quota − used − pending); null for unpaid leave. */
  left: number | null
}

/** One row per leave type for a person's year: quota, approved (used), pending and left. */
export function balanceRows(types: LeaveTypeInfo[], mine: LeaveContext['mine'], year: string): BalanceRow[] {
  return types.map((type) => {
    const inYear = mine.filter((r) => r.leave_type === type.id && r.start_date.startsWith(`${year}-`))
    const sum = (status: LeaveStatus) => inYear.filter((r) => r.status === status).reduce((s, r) => s + r.days, 0)
    const used = sum('approved')
    const pending = sum('pending')
    return {
      type,
      quota: type.paid ? type.yearly_quota_days : null,
      used,
      pending,
      left: type.paid ? Math.round((type.yearly_quota_days - used - pending) * 10) / 10 : null
    }
  })
}

/**
 * The status changes `actor` may make on a request (empty when none), mirroring the server:
 * the owner cancels while pending; managers approve or reject pending requests of their
 * employees; a manager's or admin's request goes to the admins; admins can also reverse a
 * decision (approved ↔ rejected) or cancel approved leave. Nobody decides their own.
 */
export function allowedMoves(
  actor: { id: string; role: Role },
  request: Pick<LeaveRequest, 'user' | 'status'> & { requesterRole?: Role }
): LeaveStatus[] {
  const s = request.status
  if (actor.id === request.user) return s === 'pending' ? ['cancelled'] : []
  if (!STAFF.includes(actor.role)) return []
  if (request.requesterRole && STAFF.includes(request.requesterRole) && actor.role !== 'admin') return []
  if (s === 'pending') return ['approved', 'rejected']
  if (actor.role !== 'admin') return []
  if (s === 'approved') return ['rejected', 'cancelled']
  if (s === 'rejected') return ['approved']
  return []
}
