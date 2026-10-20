import { describe, expect, it } from 'vitest'
import payroll from './payroll.js'

const MON_FRI = [1, 2, 3, 4, 5]
// October 2026: 1 Oct is a Thursday; 9 weekend days → 22 working days; with a holiday on Fri 9 Oct → 21.
const HOLIDAYS = ['2026-10-09']

describe('working days', () => {
  it('excludes weekends and holidays', () => {
    expect(payroll.workingDays('2026-10', MON_FRI, [])).toBe(22)
    expect(payroll.workingDays('2026-10', MON_FRI, HOLIDAYS)).toBe(21)
    expect(payroll.workingDays('2026-10', MON_FRI, [{ date: '2026-10-10' }])).toBe(22) // Saturday holiday changes nothing
  })

  it('follows the org’s working week', () => {
    expect(payroll.workingDays('2026-10', [1, 2, 3, 4, 5, 6], [])).toBe(27)
  })

  it('handles February in a leap year', () => {
    expect(payroll.monthDays('2028-02')).toHaveLength(29)
  })
})

describe('unpaid leave days', () => {
  it('counts working days of unpaid leave inside the month only', () => {
    const leaves = [
      { start_date: '2026-10-08', end_date: '2026-10-12', paid: false }, // Thu, (Fri holiday), Sat, Sun, Mon → 2
      { start_date: '2026-10-30', end_date: '2026-11-03', paid: false }, // Fri 30 (Sat 31) → 1 in October
      { start_date: '2026-10-20', end_date: '2026-10-20', paid: false, half_day: true }, // 0.5
      { start_date: '2026-10-21', end_date: '2026-10-23', paid: true } // paid: not deducted
    ]
    expect(payroll.unpaidLeaveDays(leaves, '2026-10', MON_FRI, HOLIDAYS)).toBe(3.5)
  })

  it('ignores leave in other months', () => {
    expect(payroll.unpaidLeaveDays([{ start_date: '2026-11-02', end_date: '2026-11-03', paid: false }], '2026-10', MON_FRI, [])).toBe(0)
  })
})

describe('calculate: a hand calculation', () => {
  // Base 100,000 in October 2026 with one holiday: 21 working days → rate 4,761.904…
  // Absent 2 + unpaid leave 1 + half day 1 × 0.5 = 3.5 days → 16,666.67 → deductions 16,667.
  // Late days cost nothing (they give stars instead).
  const month = {
    base: 100000,
    workingDays: payroll.workingDays('2026-10', MON_FRI, HOLIDAYS),
    absentDays: 2,
    unpaidLeaveDays: 1,
    halfDays: 1
  }

  it('with no adjustment', () => {
    const r = payroll.calculate({ ...month, adjustment: 0 })
    expect(r.rate).toBeCloseTo(4761.9048, 4)
    expect(r.deductions).toBe(16667)
    expect(r.net).toBe(83333)
  })

  it('with a negative adjustment (left on the 18th)', () => {
    expect(payroll.calculate({ ...month, adjustment: -20000 }).net).toBe(63333)
  })

  it('with a positive adjustment (bonus)', () => {
    expect(payroll.calculate({ ...month, adjustment: 5000 }).net).toBe(88333)
  })

  it('a perfect month pays the full salary', () => {
    expect(payroll.calculate({ base: 85000, workingDays: 22, absentDays: 0, unpaidLeaveDays: 0, halfDays: 0, adjustment: 0 })).toEqual({
      rate: 85000 / 22,
      deductions: 0,
      net: 85000
    })
  })

  it('stars are not deducted (an old caller passing a star charge)', () => {
    expect(payroll.calculate({ base: 85000, workingDays: 22, starsPkr: 1500, adjustment: 0 }).deductions).toBe(0)
  })

  it('a month with no working days deducts nothing', () => {
    expect(payroll.calculate({ base: 50000, workingDays: 0, absentDays: 3 }).deductions).toBe(0)
  })

  it('late days are not deducted', () => {
    expect(payroll.calculate({ base: 50000, workingDays: 22, lateCount: 5, latePenalty: 500 }).deductions).toBe(0)
  })
})

describe('payRates: daily, hourly and star value', () => {
  // October 2026: 22 working days (Mon–Fri, no holidays).
  it('100,000 → 4,545.45 a day, 757.58 an hour, 378.79 a star (half an hour)', () => {
    const r = payroll.payRates(100000, 22, {})
    expect(r.daily_rate).toBeCloseTo(4545.4545, 4)
    expect(r.hourly_rate).toBeCloseTo(757.5758, 4)
    expect(r.star_value).toBeCloseTo(378.7879, 4)
  })

  it('follows the target and star block, or a fixed amount', () => {
    expect(payroll.payRates(96000, 20, { required_daily_minutes: 480, star_block_minutes: 60 }).star_value).toBeCloseTo(600, 6)
    expect(payroll.payRates(100000, 22, { star_value_mode: 'fixed_pkr', star_value_pkr: 250 }).star_value).toBe(250)
  })

  it('no working days → no rates', () => {
    expect(payroll.payRates(100000, 0, {})).toEqual({ daily_rate: 0, hourly_rate: 0, star_value: 0 })
  })
})

describe('calculateDay', () => {
  const rates = payroll.payRates(120000, 24, {}) // 5,000 a day, 833.33 an hour, 416.67 a star
  const day = (extra, record) => payroll.calculateDay({ status: 'late', late_stars: 1, shortfall_stars: 2, pay_basis: 'full', ...record }, extra, rates)

  it('each star costs half an hour of pay', () => {
    const r = day(null)
    expect(r.stars).toBe(3)
    expect(r.deduction).toBeCloseTo(1250, 6)
    expect(r.day_pay).toBeCloseTo(3750, 6)
  })

  it('stars given by hand count; excused late or short stars don’t', () => {
    expect(day({ hand: 2 }).stars).toBe(5)
    expect(day({ late: true }).stars).toBe(2)
    expect(day({ short: true, hand: 1 })).toMatchObject({ late_stars: 1, shortfall_stars: 0, hand_stars: 1, stars: 2 })
  })

  it('never pays less than nothing', () => {
    const r = day(null, { late_stars: 10, shortfall_stars: 12 })
    expect(r.deduction).toBeCloseTo(5000, 6)
    expect(r.day_pay).toBe(0)
  })

  it('absent and unpaid leave pay nothing; an unpaid half day pays half', () => {
    expect(day(null, { status: 'absent', late_stars: 0, shortfall_stars: 0, pay_basis: 'none' }).day_pay).toBe(0)
    expect(day(null, { status: 'present', late_stars: 0, shortfall_stars: 0, pay_basis: 'half' }).day_pay).toBeCloseTo(2500, 6)
  })

  it('rows counted before pay_basis go by their status', () => {
    const old = (status) => payroll.calculateDay({ status }, null, rates).day_pay
    expect(old('absent')).toBe(0)
    expect(old('half_day')).toBeCloseTo(2500, 6)
    expect(old('present')).toBeCloseTo(5000, 6)
  })
})

describe('calculateMonth', () => {
  const SETTINGS = { work_days: MON_FRI }
  const PERSON = { active: true, joined_on: '2026-01-01', left_on: '' }
  const worked = (date, extra) => ({ date, status: 'present', late_stars: 0, shortfall_stars: 0, pay_basis: 'full', ...extra })
  const october = (records, more) =>
    payroll.calculateMonth({ month: '2026-10', salary: 100000, settings: SETTINGS, holidays: [], person: PERSON, records, stars: {}, adjustment: 0, ...more })
  const allWorked = () => payroll.monthDays('2026-10').filter((d) => ![6, 7].includes(new Date(d + 'T00:00:00Z').getUTCDay() || 7)).map((d) => worked(d))

  it('a perfect month pays the full salary', () => {
    const m = october(allWorked())
    expect(m.working_days).toBe(22)
    expect(m.gross).toBe(100000)
    expect(m.deductions).toBe(0)
    expect(m.net).toBe(100000)
    expect(m.stars).toBe(0)
  })

  it('stars cost half an hour each, rounded to 2 decimals only at the end', () => {
    const records = allWorked()
    records[0] = worked(records[0].date, { status: 'late', late_stars: 1 }) // 1–30 min late
    records[1] = worked(records[1].date, { shortfall_stars: 2 }) // 5 hours active
    const m = october(records)
    expect(m).toMatchObject({ late_stars: 1, shortfall_stars: 2, hand_stars: 0, stars: 3 })
    expect(m.star_deduction).toBe(1136.36) // 3 × 378.7878…
    expect(m.gross).toBe(98863.64)
    expect(m.deductions).toBe(1136.36)
    expect(m.net).toBe(98863.64)
  })

  it('an absent day pays nothing and gives no stars', () => {
    const records = allWorked()
    records[4] = { date: records[4].date, status: 'absent', late_stars: 0, shortfall_stars: 0, pay_basis: 'none' }
    const m = october(records)
    expect(m.absent_days).toBe(1)
    expect(m.stars).toBe(0)
    expect(m.gross).toBe(95454.55)
  })

  it('unpaid leave pays nothing; paid leave pays the full day', () => {
    const records = allWorked()
    records[2] = { date: records[2].date, status: 'on_leave', pay_basis: 'none' }
    records[3] = { date: records[3].date, status: 'on_leave', pay_basis: 'full' }
    const m = october(records)
    expect(m.unpaid_days).toBe(1)
    expect(m.gross).toBe(95454.55)
  })

  it('a holiday is not a working day: the daily rate gets bigger, the month still pays in full', () => {
    const m = october(allWorked().filter((r) => r.date !== '2026-10-13'), { holidays: ['2026-10-13'] })
    expect(m.working_days).toBe(21)
    expect(m.daily_rate).toBeCloseTo(4761.9048, 4)
    expect(m.gross).toBe(100000)
  })

  it('hand stars and excuses from star records', () => {
    const records = allWorked()
    records[0] = worked(records[0].date, { status: 'late', late_stars: 2 })
    const stars = { [records[0].date]: { hand: 0, late: true, short: false }, [records[5].date]: { hand: 2, late: false, short: false } }
    const m = october(records, { stars })
    expect(m).toMatchObject({ late_stars: 0, hand_stars: 2, stars: 2 })
    expect(m.star_deduction).toBe(757.58)
  })

  it('stars given by hand on a weekend come off the month', () => {
    const m = october(allWorked(), { stars: { '2026-10-17': { hand: 1, late: false, short: false } } })
    expect(m.hand_stars).toBe(1)
    expect(m.gross).toBe(99621.21)
  })

  it('days not counted yet pay in full; days before joining pay nothing', () => {
    expect(october([]).gross).toBe(100000)
    const joined = october([], { person: { active: true, joined_on: '2026-10-16', left_on: '' } })
    expect(joined.gross).toBe(50000) // 11 of 22 working days
    expect(joined.days.filter((d) => !d.employed).length).toBe(11)
  })

  it('adds the adjustment to the net', () => {
    expect(october(allWorked(), { adjustment: -20000 }).net).toBe(80000)
  })

  it('February has its own working days', () => {
    expect(payroll.calculateMonth({ month: '2026-02', salary: 100000, settings: SETTINGS, person: PERSON }).working_days).toBe(20)
    expect(payroll.calculateMonth({ month: '2028-02', salary: 100000, settings: SETTINGS, person: PERSON }).working_days).toBe(21)
  })
})

describe('attendance counts', () => {
  it('counts absent and half day; other statuses (late included) cost nothing', () => {
    const records = ['absent', 'absent', 'half_day', 'late', 'late', 'late', 'present', 'on_leave', 'holiday', 'weekend'].map((status) => ({ status }))
    expect(payroll.attendanceCounts(records)).toEqual({ absent: 2, half: 1 })
  })
})

describe('who is paid and for which month', () => {
  it('includes anyone employed for part of the month', () => {
    expect(payroll.employedDuring('2026-10', { active: true, joined_on: '2026-10-15', left_on: '' })).toBe(true)
    expect(payroll.employedDuring('2026-10', { active: false, joined_on: '2026-01-01', left_on: '2026-10-18' })).toBe(true)
    expect(payroll.employedDuring('2026-10', { active: true, joined_on: '2026-11-01', left_on: '' })).toBe(false)
    expect(payroll.employedDuring('2026-10', { active: false, joined_on: '2026-01-01', left_on: '2026-09-30' })).toBe(false)
    expect(payroll.employedDuring('2026-10', { active: false, joined_on: '', left_on: '' })).toBe(false)
  })

  it.each([
    [{ month: '2026-10' }, '2026-10', null],
    [{ month: '2026-09' }, '2026-10', null],
    [{ month: '2026-11' }, '2026-10', 'current month or earlier'],
    [{ month: '2026-13' }, '2026-10', 'Pick a month'],
    [{}, '2026-10', 'Pick a month']
  ])('parseMonth %o', (body, current, error) => {
    const r = payroll.parseMonth(body, current)
    if (error) expect(r.error).toContain(error)
    else expect(r.data.month).toBe(body.month)
  })

  it('names months', () => {
    expect(payroll.monthLabel('2026-10')).toBe('October 2026')
  })
})
