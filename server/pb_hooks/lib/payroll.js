// Pure payroll calculation (plan §4.5) for payroll.pb.js. No PocketBase globals
// here, so Vitest can test the same file the hook require()s.
//
//   per-day rate = monthly salary ÷ working days in the month (weekends and holidays excluded)
//   deductions   = (absent days + unpaid-leave days + 0.5 × half days) × rate
//   net          = monthly salary − deductions + adjustment
// There is no automatic pro-rating: the admin sets an adjustment for mid-month joiners and leavers.
// Late days cost nothing here: they give stars instead (star_rules), which never touch pay.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const DAY_MS = 86400000

function isMonth(value) {
  return typeof value === 'string' && MONTH.test(value)
}

function addDays(dateKey, days) {
  return new Date(Date.parse(dateKey + 'T00:00:00.000Z') + days * DAY_MS).toISOString().slice(0, 10)
}

/** 1 = Monday … 7 = Sunday, like org_settings.work_days. */
function isoWeekday(dateKey) {
  const day = new Date(dateKey + 'T00:00:00.000Z').getUTCDay()
  return day === 0 ? 7 : day
}

/** Every day of a "YYYY-MM" month. */
function monthDays(month) {
  const out = []
  for (let d = month + '-01'; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d)
  return out
}

function monthRange(month) {
  const days = monthDays(month)
  return { from: days[0], to: days[days.length - 1] }
}

function holidaySet(holidays) {
  const set = {}
  for (const h of holidays || []) set[typeof h === 'string' ? h : h.date] = true
  return set
}

function isWorkingDay(day, workDays, holidays) {
  return (workDays || []).indexOf(isoWeekday(day)) !== -1 && !holidays[day]
}

/** Working days in the month: the per-day rate's divisor. */
function workingDays(month, workDays, holidays) {
  const set = holidaySet(holidays)
  return monthDays(month).filter((d) => isWorkingDay(d, workDays, set)).length
}

/**
 * Unpaid-leave days that fall in the month: working days of each approved unpaid
 * leave inside the month (a request may span two months), 0.5 for a half day.
 */
function unpaidLeaveDays(leaves, month, workDays, holidays) {
  const set = holidaySet(holidays)
  const range = monthRange(month)
  let total = 0
  for (const l of leaves || []) {
    if (l.paid) continue
    const from = l.start_date > range.from ? l.start_date : range.from
    const to = l.end_date < range.to ? l.end_date : range.to
    if (from > to) continue
    if (l.half_day) {
      if (isWorkingDay(from, workDays, set)) total += 0.5
      continue
    }
    for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, workDays, set)) total += 1
  }
  return total
}

/** Absent and half-day counts from the month's attendance records. */
function attendanceCounts(records) {
  const out = { absent: 0, half: 0 }
  for (const r of records || []) {
    if (r.status === 'absent') out.absent++
    else if (r.status === 'half_day') out.half++
  }
  return out
}

/** The formula. Amounts are whole rupees; the per-day rate keeps its decimals until the end. */
function calculate(input) {
  const base = Number(input.base) || 0
  const days = Number(input.workingDays) || 0
  const rate = days > 0 ? base / days : 0
  const deductedDays = (Number(input.absentDays) || 0) + (Number(input.unpaidLeaveDays) || 0) + 0.5 * (Number(input.halfDays) || 0)
  const deductions = Math.round(deductedDays * rate)
  const adjustment = Math.round(Number(input.adjustment) || 0)
  return { rate: rate, deductions: deductions, net: base - deductions + adjustment }
}

/** Whether someone was employed for at least one day of the month. */
function employedDuring(month, user) {
  const range = monthRange(month)
  if (!user.active && !user.left_on) return false
  if (user.joined_on && user.joined_on > range.to) return false
  if (user.left_on && user.left_on < range.from) return false
  return true
}

/** The route's body: { month: "YYYY-MM" }, no later than the current month. */
function parseMonth(body, currentMonth) {
  const month = body && typeof body.month === 'string' ? body.month.trim() : ''
  if (!isMonth(month)) return { error: 'Pick a month.' }
  if (month > currentMonth) return { error: 'Payroll can be run for the current month or earlier.' }
  return { data: { month: month } }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthLabel(month) {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4)
}

module.exports = {
  isMonth,
  monthDays,
  monthRange,
  workingDays,
  unpaidLeaveDays,
  attendanceCounts,
  calculate,
  employedDuring,
  parseMonth,
  monthLabel
}
