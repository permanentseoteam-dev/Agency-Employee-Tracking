// Pure leave rules (plan §4.3). Plain CommonJS with no server globals, so Vitest
// tests the same file the Edge Functions bundle (scripts/build-edge-shared.mjs).
// Dates are "YYYY-MM-DD" day
// keys in the org timezone; work days are ISO weekdays (1 = Monday … 7 = Sunday).

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86400000
/** The longest request, in calendar days. */
const MAX_RANGE_DAYS = 60
const STAFF_ROLES = ['manager', 'admin']

function isDateKey(value) {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false
  const p = value.split('-').map(Number)
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2]
}

function addDays(dateKey, days) {
  return new Date(Date.parse(dateKey + 'T00:00:00.000Z') + days * DAY_MS).toISOString().slice(0, 10)
}

function isoWeekday(dateKey) {
  const day = new Date(dateKey + 'T00:00:00.000Z').getUTCDay()
  return day === 0 ? 7 : day
}

/** Every day from–to, inclusive (capped a little past MAX_RANGE_DAYS). */
function daysBetween(from, to) {
  const out = []
  for (let d = from; d <= to && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d)
  return out
}

/** Problems with the dates on their own; null when they are fine. */
function checkDates(start, end, halfDay) {
  if (!isDateKey(start)) return 'Pick a valid start date.'
  if (!isDateKey(end)) return 'Pick a valid end date.'
  if (end < start) return 'The end date must be on or after the start date.'
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return 'Leave can’t run across the new year. Send one request up to 31 Dec and another from 1 Jan.'
  }
  if (daysBetween(start, end).length > MAX_RANGE_DAYS) return 'A request can cover at most ' + MAX_RANGE_DAYS + ' days.'
  if (halfDay && start !== end) return 'A half day must start and end on the same day.'
  return null
}

/** The days in the range that are working days: a work weekday and not a holiday. */
function workingDays(start, end, workDays, holidays) {
  const off = {}
  for (const h of holidays || []) off[typeof h === 'string' ? h : h && h.date] = true
  return daysBetween(start, end).filter((d) => (workDays || []).indexOf(isoWeekday(d)) !== -1 && !off[d])
}

/** Days a request counts: its working days, or 0.5 for a half day on a working day. */
function countDays(start, end, halfDay, workDays, holidays) {
  const n = workingDays(start, end, workDays, holidays).length
  return halfDay ? (n > 0 ? 0.5 : 0) : n
}

/** Leave only within the person's employment (joined_on / left_on may be empty). */
function checkEmployment(start, end, user) {
  const u = user || {}
  if (u.joined_on && start < u.joined_on) return 'Leave can’t start before your joining date (' + u.joined_on + ').'
  if (u.left_on && end > u.left_on) return 'Leave can’t go past your leaving date (' + u.left_on + ').'
  return null
}

/**
 * Checks a new request and counts its days.
 * input: { start_date, end_date, half_day }. ctx: { workDays, holidays, user: { joined_on, left_on } }.
 * Returns { days } or { error }.
 */
function evaluateRequest(input, ctx) {
  const c = ctx || {}
  const halfDay = !!input.half_day
  const problem = checkDates(input.start_date, input.end_date, halfDay) || checkEmployment(input.start_date, input.end_date, c.user)
  if (problem) return { error: problem }
  const days = countDays(input.start_date, input.end_date, halfDay, c.workDays, c.holidays)
  if (days === 0) {
    return { error: halfDay ? 'That day isn’t a working day.' : 'There are no working days in these dates (only weekends or holidays).' }
  }
  return { days: days }
}

function fmt(n) {
  return String(Math.round(n * 10) / 10)
}

/**
 * Paid leave is limited to the yearly quota; unpaid leave is not.
 * takenDays: what already counts against the quota that year (excluding this request).
 */
function quotaProblem(type, takenDays, newDays) {
  if (!type || !type.paid) return null
  const quota = Number(type.yearly_quota_days) || 0
  const left = quota - (Number(takenDays) || 0)
  if (newDays <= left + 1e-9) return null
  const name = type.name || 'this leave type'
  if (left <= 0) return 'No ' + name + ' leave left this year (quota ' + fmt(quota) + ' days).'
  return 'Only ' + fmt(left) + ' day' + (left === 1 ? '' : 's') + ' of ' + name + ' leave left this year; this request needs ' + fmt(newDays) + '.'
}

/** The year a request counts against (requests never cross a year). */
function yearOf(dateKey) {
  return String(dateKey || '').slice(0, 4)
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * A request's leave per month for the monthly limits: { "YYYY-MM": { full, half } }, where
 * full = its working days in that month and half = 1 for a half-day (short) leave.
 * A request may run into the next month; each month counts its own days.
 */
function leaveByMonth(start, end, halfDay, workDays, holidays) {
  const out = {}
  if (halfDay) {
    if (workingDays(start, start, workDays, holidays).length) out[start.slice(0, 7)] = { full: 0, half: 1 }
    return out
  }
  for (const d of workingDays(start, end, workDays, holidays)) {
    const month = d.slice(0, 7)
    out[month] = out[month] || { full: 0, half: 0 }
    out[month].full++
  }
  return out
}

/** The leave several requests ({ start_date, end_date, half_day }) add up to in one month. */
function monthTotals(requests, month, workDays, holidays) {
  const out = { full: 0, half: 0 }
  for (const r of requests || []) {
    const m = leaveByMonth(r.start_date, r.end_date, !!r.half_day, workDays, holidays)[month]
    if (m) {
      out.full += m.full
      out.half += m.half
    }
  }
  return out
}

/**
 * Leave per month from Rules: limits { full, half }, 0 = no limit. taken: the person's
 * other leave in the month; adding: this request's, both { full, half }.
 * Returns null when it fits, or the reason it doesn't.
 */
function monthlyLimitProblem(limits, month, taken, adding) {
  const name = MONTH_NAMES[Number(String(month).slice(5, 7)) - 1] || month
  const check = (limit, used, add, kind, one, many) => {
    const max = Number(limit) || 0
    if (max <= 0 || !(add > 0) || used + add <= max) return null
    const left = Math.max(0, max - used)
    const rule = ' (limit ' + max + ' a month)'
    if (left === 0) return 'No ' + kind + ' leave left in ' + name + rule + '.'
    return 'Only ' + left + ' ' + (left === 1 ? one : many) + ' of leave left in ' + name + rule + '; this request needs ' + add + '.'
  }
  const t = taken || {}
  const a = adding || {}
  return (
    check(limits && limits.full, Number(t.full) || 0, Number(a.full) || 0, 'full-day', 'full day', 'full days') ||
    check(limits && limits.half, Number(t.half) || 0, Number(a.half) || 0, 'half-day (short)', 'half day', 'half days')
  )
}

/**
 * Whether `actor` may move a request of `requester` from `before` to `after`.
 * actor and requester: { id, role }. Returns null when allowed, or the reason it isn't.
 * - The owner may only cancel their own pending request; nobody decides their own.
 * - Managers approve or reject pending requests; a manager's or admin's own request goes to the admins.
 * - Admins may also reverse a decision (approved ↔ rejected) or cancel approved leave.
 */
function decisionProblem(actor, requester, before, after) {
  if (actor.id === requester.id) {
    if (before === 'pending' && after === 'cancelled') return null
    if (after === 'approved' || after === 'rejected') return 'You can’t decide your own leave request.'
    return 'You can only cancel your own request while it is pending.'
  }
  if (STAFF_ROLES.indexOf(actor.role) === -1) return 'Only managers and admins can decide leave requests.'
  if (STAFF_ROLES.indexOf(requester.role) !== -1 && actor.role !== 'admin') {
    return 'A manager’s or admin’s own leave is decided by an admin.'
  }
  if (before === after) return 'The request is already ' + after + '.'
  if (before === 'cancelled') return 'A cancelled request can’t be reopened. Ask for a new request instead.'
  if (after === 'pending') return 'A decided request can’t go back to pending.'

  if (before === 'pending') {
    if (after === 'approved' || after === 'rejected') return null
    return 'Approve or reject the request; only the employee can cancel it while it is pending.'
  }
  if (actor.role !== 'admin') return 'Only an admin can change a decision that has already been made.'
  if (before === 'approved' && (after === 'rejected' || after === 'cancelled')) return null
  if (before === 'rejected' && after === 'approved') return null
  return 'A rejected request can only be approved.'
}

/** Fields a request keeps once sent: the owner may only change the status, staff the status and comment. */
const OWNER_EDITABLE = ['status']
const STAFF_EDITABLE = ['status', 'comment']
const CHECKED_FIELDS = ['user', 'leave_type', 'start_date', 'end_date', 'half_day', 'days', 'reason', 'status', 'comment']

/** changed: names of fields whose value changed. Returns null or the reason the update is refused. */
function lockedFieldProblem(changed, isOwner) {
  const editable = isOwner ? OWNER_EDITABLE : STAFF_EDITABLE
  const locked = (changed || []).filter((f) => CHECKED_FIELDS.indexOf(f) !== -1 && editable.indexOf(f) === -1)
  if (!locked.length) return null
  return isOwner
    ? 'A sent request can’t be edited. Cancel it and send a new one.'
    : 'Only the status and comment can change when deciding a request (not: ' + locked.join(', ') + ').'
}

/** A decision the server stamps with the approver and time (the owner's own cancel is not one). */
function isStaffDecision(actorId, requesterId, after) {
  return actorId !== requesterId && (after === 'approved' || after === 'rejected' || after === 'cancelled')
}

/**
 * Past days whose attendance changes when approved leave appears or goes away:
 * the request's days before today (attendance is counted for finished days only).
 */
function attendanceDaysToRecount(before, after, start, end, today) {
  if ((before === 'approved') === (after === 'approved')) return []
  if (!isDateKey(start) || !isDateKey(end) || !isDateKey(today)) return []
  const last = end < today ? end : addDays(today, -1)
  return start <= last ? daysBetween(start, last) : []
}

module.exports = {
  MAX_RANGE_DAYS,
  CHECKED_FIELDS,
  isDateKey,
  addDays,
  isoWeekday,
  daysBetween,
  checkDates,
  workingDays,
  countDays,
  checkEmployment,
  evaluateRequest,
  quotaProblem,
  yearOf,
  leaveByMonth,
  monthTotals,
  monthlyLimitProblem,
  decisionProblem,
  lockedFieldProblem,
  isStaffDecision,
  attendanceDaysToRecount
}
