import { describe, expect, it } from 'vitest'
import { monthDays } from './attendance'
import { isoWeekday } from './dates'
import { calculateDay, calculateMonth, payRates, type PayRecord } from './pay'

// The same cases as shared/logic/payroll.test.mjs, so the screens and the server agree.
const SETTINGS = { work_days: [1, 2, 3, 4, 5] }
const PERSON = { active: true, joined_on: '2026-01-01', left_on: '' }
const worked = (date: string, extra: Partial<PayRecord> = {}): PayRecord => ({
  date,
  status: 'present',
  late_stars: 0,
  shortfall_stars: 0,
  pay_basis: 'full',
  ...extra
})
const allWorked = () =>
  monthDays('2026-10')
    .filter((d) => isoWeekday(d) <= 5)
    .map((d) => worked(d))
const october = (records: PayRecord[], more = {}) =>
  calculateMonth({ month: '2026-10', salary: 100000, settings: SETTINGS, holidays: [], person: PERSON, records, stars: {}, adjustment: 0, ...more })

describe('payRates', () => {
  it('100,000 in October → 4,545.45 a day, 757.58 an hour, 378.79 a star', () => {
    const r = payRates(100000, 22, {})
    expect(r.daily_rate).toBeCloseTo(4545.4545, 4)
    expect(r.hourly_rate).toBeCloseTo(757.5758, 4)
    expect(r.star_value).toBeCloseTo(378.7879, 4)
  })

  it('a fixed amount per star', () => {
    expect(payRates(100000, 22, { star_value_mode: 'fixed_pkr', star_value_pkr: 250 }).star_value).toBe(250)
  })
})

describe('calculateDay', () => {
  const rates = payRates(120000, 24, {}) // 5,000 a day
  it('each star costs half an hour of pay, never more than the day', () => {
    expect(calculateDay({ status: 'late', late_stars: 1, shortfall_stars: 2, pay_basis: 'full' }, null, rates).day_pay).toBeCloseTo(3750, 6)
    expect(calculateDay({ status: 'late', late_stars: 10, shortfall_stars: 12, pay_basis: 'full' }, null, rates).day_pay).toBe(0)
  })

  it('hand stars count; excused late or short stars don’t', () => {
    const r = calculateDay({ status: 'late', late_stars: 1, shortfall_stars: 2, pay_basis: 'full' }, { hand: 1, late: true, short: false }, rates)
    expect(r).toMatchObject({ late_stars: 0, shortfall_stars: 2, hand_stars: 1, stars: 3 })
  })

  it('absent pays nothing; an unpaid half day pays half', () => {
    expect(calculateDay({ status: 'absent', pay_basis: 'none' }, null, rates).day_pay).toBe(0)
    expect(calculateDay({ status: 'present', pay_basis: 'half' }, null, rates).day_pay).toBeCloseTo(2500, 6)
  })
})

describe('calculateMonth', () => {
  it('a perfect month pays the full salary', () => {
    expect(october(allWorked())).toMatchObject({ working_days: 22, gross: 100000, deductions: 0, net: 100000, stars: 0 })
  })

  it('3 stars cost 1,136.36, rounded only at the end', () => {
    const records = allWorked()
    records[0] = worked(records[0].date, { status: 'late', late_stars: 1 })
    records[1] = worked(records[1].date, { shortfall_stars: 2 })
    expect(october(records)).toMatchObject({ stars: 3, star_deduction: 1136.36, gross: 98863.64, deductions: 1136.36, net: 98863.64 })
  })

  it('absent and unpaid leave pay nothing', () => {
    const records = allWorked()
    records[2] = { date: records[2].date, status: 'absent', pay_basis: 'none' }
    records[3] = { date: records[3].date, status: 'on_leave', pay_basis: 'none' }
    expect(october(records)).toMatchObject({ absent_days: 1, unpaid_days: 1, gross: 90909.09 })
  })

  it('a holiday is not a working day; the month still pays in full', () => {
    const m = october(allWorked().filter((r) => r.date !== '2026-10-13'), { holidays: ['2026-10-13'] })
    expect(m.working_days).toBe(21)
    expect(m.gross).toBe(100000)
  })

  it('hand stars on a weekend come off the month', () => {
    expect(october(allWorked(), { stars: { '2026-10-17': { hand: 1, late: false, short: false } } }).gross).toBe(99621.21)
  })

  it('days not counted yet pay in full (the projection); days before joining pay nothing', () => {
    expect(october([]).gross).toBe(100000)
    expect(october([], { person: { active: true, joined_on: '2026-10-16', left_on: '' } }).gross).toBe(50000)
  })

  it('adds the adjustment', () => {
    expect(october(allWorked(), { adjustment: -20000 }).net).toBe(80000)
  })
})
