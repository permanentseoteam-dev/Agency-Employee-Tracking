// Pure payroll calculation (plan §4.5). Plain CommonJS with no server globals, so Vitest
// tests the same file the Edge Functions bundle (scripts/build-edge-shared.mjs).
//
//   per-day rate = monthly salary ÷ working days in the month (weekends and holidays excluded)
//   deductions   = (absent days + unpaid-leave days + 0.5 × half days) × rate
//   net          = monthly salary − deductions + adjustment
// There is no automatic pro-rating: the admin sets an adjustment for mid-month joiners and leavers.
// Late days cost nothing here: they give stars instead (star_rules), and stars don't cost pay.

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

// ---- Day pay (the star-penalty model) ------------------------------------------------------
//   daily rate  = monthly salary ÷ working days in the month (weekends and holidays excluded)
//   hourly rate = daily rate ÷ the daily target in hours (6 by default)
//   star value  = pay for one star block (half an hour by default), or a fixed PKR amount
//   day pay     = max(0, base − stars × star value) on each working day; base is the daily rate
//                 × the day's pay_basis share (worked or paid leave 1, unpaid half day ½, absent or
//                 unpaid leave 0)
//   net         = Σ day pay + adjustment, rounded to 2 decimals only at the end

/** Each pay_basis (attendance.statusFor) as a share of the daily rate. */
const BASIS_SHARE = { full: 1, half: 0.5, none: 0 }

function round2(x) {
  return Math.round(x * 100) / 100
}

/**
 * A person's rates for a month, unrounded. settings: org_settings (required_daily_minutes,
 * star_block_minutes, star_value_mode, star_value_pkr).
 */
function payRates(salary, workingDayCount, settings) {
  const s = settings || {}
  const target = Number(s.required_daily_minutes) > 0 ? Number(s.required_daily_minutes) : 360
  const block = Number(s.star_block_minutes) > 0 ? Number(s.star_block_minutes) : 30
  const daily = workingDayCount > 0 ? (Number(salary) || 0) / workingDayCount : 0
  const hourly = daily / (target / 60)
  const star = s.star_value_mode === 'fixed_pkr' ? Math.max(0, Number(s.star_value_pkr) || 0) : (hourly * block) / 60
  return { daily_rate: daily, hourly_rate: hourly, star_value: star }
}

/** The share of the daily rate a day pays before stars. Rows counted before pay_basis go by their status. */
function basisShare(record) {
  if (Object.prototype.hasOwnProperty.call(BASIS_SHARE, record.pay_basis)) return BASIS_SHARE[record.pay_basis]
  if (record.status === 'absent') return 0
  if (record.status === 'half_day') return 0.5
  return 1
}

/**
 * One working day's pay. record: the attendance row ({ status, late_stars, shortfall_stars, pay_basis }).
 * extra: stars.recordsByDay() for the day ({ hand, late, short }; late/short true = excused).
 * rates: payRates(). Each star costs the star value, never more than the day pays.
 */
function calculateDay(record, extra, rates) {
  const e = extra || {}
  const late = e.late ? 0 : Number(record.late_stars) || 0
  const short = e.short ? 0 : Number(record.shortfall_stars) || 0
  const hand = Number(e.hand) || 0
  const stars = late + short + hand
  const base = basisShare(record) * rates.daily_rate
  const deduction = Math.min(base, stars * rates.star_value)
  return { late_stars: late, shortfall_stars: short, hand_stars: hand, stars: stars, base: base, deduction: deduction, day_pay: base - deduction }
}

function employedOnDay(day, user) {
  if (!user.active && !user.left_on) return false
  if (user.joined_on && day < user.joined_on) return false
  if (user.left_on && day > user.left_on) return false
  return true
}

/**
 * One person's month: the sum of each working day's pay.
 * input: { month, salary, adjustment, settings (work_days + the star settings), holidays,
 *   person: { active, joined_on, left_on }, records: the person's attendance rows for the month,
 *   stars: stars.recordsByDay() for the person }.
 * A working day with no record yet (today or later) counts as full pay with no stars; days before
 * joining or after leaving pay nothing. Stars given by hand on a day off come off the month total.
 */
function calculateMonth(input) {
  const i = input || {}
  const s = i.settings || {}
  const salary = Number(i.salary) || 0
  const person = i.person || {}
  const holidays = holidaySet(i.holidays)
  const working = monthDays(i.month).filter((d) => isWorkingDay(d, s.work_days, holidays))
  const rates = payRates(salary, working.length, s)
  const byDate = {}
  for (const r of i.records || []) byDate[r.date] = r
  const extras = i.stars || {}
  const t = { late: 0, short: 0, hand: 0, starDeduction: 0, absent: 0, unpaid: 0, gross: 0 }
  const days = []
  for (const d of working) {
    if (!employedOnDay(d, person)) {
      days.push({ date: d, employed: false, counted: false, status: '', late_stars: 0, shortfall_stars: 0, hand_stars: 0, stars: 0, base: 0, deduction: 0, day_pay: 0 })
      continue
    }
    const rec = byDate[d]
    const line = calculateDay(rec || { pay_basis: 'full' }, extras[d], rates)
    t.late += line.late_stars
    t.short += line.shortfall_stars
    t.hand += line.hand_stars
    t.starDeduction += line.deduction
    t.gross += line.day_pay
    if (rec && rec.status === 'absent') t.absent++
    else if (rec) t.unpaid += 1 - basisShare(rec)
    days.push(Object.assign({ date: d, employed: true, counted: !!rec, status: rec ? rec.status : '' }, line))
  }
  // Stars given by hand on a weekend or holiday have no day pay to come off: they come off the month.
  let offStars = 0
  for (const d of Object.keys(extras)) {
    if (d.slice(0, 7) === i.month && working.indexOf(d) === -1) offStars += Number(extras[d].hand) || 0
  }
  if (offStars) {
    const off = Math.min(t.gross, offStars * rates.star_value)
    t.hand += offStars
    t.starDeduction += off
    t.gross -= off
  }
  if (!working.length && employedDuring(i.month, person)) t.gross = salary
  const gross = round2(t.gross)
  return {
    working_days: working.length,
    daily_rate: rates.daily_rate,
    hourly_rate: rates.hourly_rate,
    star_value: rates.star_value,
    late_stars: t.late,
    shortfall_stars: t.short,
    hand_stars: t.hand,
    stars: t.late + t.short + t.hand,
    star_deduction: round2(t.starDeduction),
    absent_days: t.absent,
    unpaid_days: t.unpaid,
    gross: gross,
    deductions: round2(salary - gross),
    net: round2(gross + Math.round(Number(i.adjustment) || 0)),
    days: days
  }
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
  payRates,
  calculateDay,
  calculateMonth,
  employedDuring,
  parseMonth,
  monthLabel
}
