// Day and month pay for the screens that explain it (the daily breakdown, My pay's projection).
// The same rules as the server (shared/logic/payroll.js calculateDay and calculateMonth):
//   daily rate  = monthly salary ÷ working days in the month (weekends and holidays excluded)
//   hourly rate = daily rate ÷ the daily target in hours (6 by default)
//   star value  = pay for one star block (half an hour by default), or a fixed PKR amount
//   day pay     = max(0, base − stars × star value) on each working day
//   net         = Σ day pay + adjustment, rounded to 2 decimals only at the end
// Pure, so it is tested with the same cases as the server.
import { monthDays } from './attendance'
import { isoWeekday } from './dates'

export type PayBasis = 'full' | 'half' | 'none' | 'off'

export interface PaySettings {
  work_days: number[]
  required_daily_minutes?: number
  star_block_minutes?: number
  star_value_mode?: 'half_hour_pay' | 'fixed_pkr'
  star_value_pkr?: number
}

/** The attendance fields pay needs. */
export interface PayRecord {
  date: string
  status: string
  late_stars?: number
  shortfall_stars?: number
  pay_basis?: PayBasis | string
}

/** A day's star records: stars given by hand, and whether the late or short stars were excused. */
export interface DayStars {
  hand: number
  late: boolean
  short: boolean
}

export interface Rates {
  daily_rate: number
  hourly_rate: number
  star_value: number
}

export interface DayPay {
  late_stars: number
  shortfall_stars: number
  hand_stars: number
  stars: number
  base: number
  deduction: number
  day_pay: number
}

export interface DayLine extends DayPay {
  date: string
  employed: boolean
  /** False for a working day with no attendance record yet (today or later): counted as full pay. */
  counted: boolean
  status: string
}

export interface MonthPay extends Rates {
  working_days: number
  late_stars: number
  shortfall_stars: number
  hand_stars: number
  stars: number
  star_deduction: number
  absent_days: number
  unpaid_days: number
  gross: number
  deductions: number
  net: number
  days: DayLine[]
}

export interface MonthInput {
  month: string
  salary: number
  adjustment?: number
  settings: PaySettings
  holidays?: (string | { date: string })[]
  person: { active?: boolean; joined_on?: string; left_on?: string }
  records?: PayRecord[]
  stars?: Record<string, DayStars>
}

const BASIS_SHARE: Record<string, number> = { full: 1, half: 0.5, none: 0 }

const round2 = (x: number) => Math.round(x * 100) / 100

export function payRates(salary: number, workingDayCount: number, settings: Partial<PaySettings>): Rates {
  const target = Number(settings.required_daily_minutes) > 0 ? Number(settings.required_daily_minutes) : 360
  const block = Number(settings.star_block_minutes) > 0 ? Number(settings.star_block_minutes) : 30
  const daily = workingDayCount > 0 ? (Number(salary) || 0) / workingDayCount : 0
  const hourly = daily / (target / 60)
  const star = settings.star_value_mode === 'fixed_pkr' ? Math.max(0, Number(settings.star_value_pkr) || 0) : (hourly * block) / 60
  return { daily_rate: daily, hourly_rate: hourly, star_value: star }
}

/** The share of the daily rate a day pays before stars. Rows counted before pay_basis go by their status. */
export function basisShare(record: { status?: string; pay_basis?: string }): number {
  if (record.pay_basis && record.pay_basis in BASIS_SHARE) return BASIS_SHARE[record.pay_basis]
  if (record.status === 'absent') return 0
  if (record.status === 'half_day') return 0.5
  return 1
}

/** One working day's pay: each star costs the star value, never more than the day pays. */
export function calculateDay(record: Partial<PayRecord>, extra: DayStars | undefined | null, rates: Rates): DayPay {
  const late = extra?.late ? 0 : Number(record.late_stars) || 0
  const short = extra?.short ? 0 : Number(record.shortfall_stars) || 0
  const hand = Number(extra?.hand) || 0
  const stars = late + short + hand
  const base = basisShare(record) * rates.daily_rate
  const deduction = Math.min(base, stars * rates.star_value)
  return { late_stars: late, shortfall_stars: short, hand_stars: hand, stars, base, deduction, day_pay: base - deduction }
}

function employedOnDay(day: string, p: MonthInput['person']): boolean {
  if (!p.active && !p.left_on) return false
  if (p.joined_on && day < p.joined_on) return false
  if (p.left_on && day > p.left_on) return false
  return true
}

/**
 * One person's month: the sum of each working day's pay. A working day with no record yet counts as
 * full pay with no stars (so this is also the month's projection); days before joining or after
 * leaving pay nothing; stars given by hand on a day off come off the month total.
 */
export function calculateMonth(input: MonthInput): MonthPay {
  const salary = Number(input.salary) || 0
  const holidays = new Set((input.holidays ?? []).map((h) => (typeof h === 'string' ? h : h.date)))
  const workDays = input.settings.work_days ?? []
  const working = monthDays(input.month).filter((d) => workDays.includes(isoWeekday(d)) && !holidays.has(d))
  const rates = payRates(salary, working.length, input.settings)
  const byDate = new Map((input.records ?? []).map((r) => [r.date, r]))
  const extras = input.stars ?? {}
  const t = { late: 0, short: 0, hand: 0, starDeduction: 0, absent: 0, unpaid: 0, gross: 0 }
  const days: DayLine[] = []
  for (const d of working) {
    if (!employedOnDay(d, input.person)) {
      days.push({ date: d, employed: false, counted: false, status: '', late_stars: 0, shortfall_stars: 0, hand_stars: 0, stars: 0, base: 0, deduction: 0, day_pay: 0 })
      continue
    }
    const rec = byDate.get(d)
    const line = calculateDay(rec ?? { pay_basis: 'full' }, extras[d], rates)
    t.late += line.late_stars
    t.short += line.shortfall_stars
    t.hand += line.hand_stars
    t.starDeduction += line.deduction
    t.gross += line.day_pay
    if (rec?.status === 'absent') t.absent++
    else if (rec) t.unpaid += 1 - basisShare(rec)
    days.push({ date: d, employed: true, counted: !!rec, status: rec?.status ?? '', ...line })
  }
  // Stars given by hand on a weekend or holiday have no day pay to come off: they come off the month.
  let offStars = 0
  for (const [d, e] of Object.entries(extras)) if (d.startsWith(input.month) && !working.includes(d)) offStars += Number(e.hand) || 0
  if (offStars) {
    const off = Math.min(t.gross, offStars * rates.star_value)
    t.hand += offStars
    t.starDeduction += off
    t.gross -= off
  }
  if (!working.length && monthDays(input.month).some((d) => employedOnDay(d, input.person))) t.gross = salary
  const gross = round2(t.gross)
  return {
    working_days: working.length,
    ...rates,
    late_stars: t.late,
    shortfall_stars: t.short,
    hand_stars: t.hand,
    stars: t.late + t.short + t.hand,
    star_deduction: round2(t.starDeduction),
    absent_days: t.absent,
    unpaid_days: t.unpaid,
    gross,
    deductions: round2(salary - gross),
    net: round2(gross + Math.round(Number(input.adjustment) || 0)),
    days
  }
}
