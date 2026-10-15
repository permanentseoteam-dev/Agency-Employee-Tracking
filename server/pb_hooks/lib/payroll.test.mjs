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

  it('a month with no working days deducts nothing', () => {
    expect(payroll.calculate({ base: 50000, workingDays: 0, absentDays: 3 }).deductions).toBe(0)
  })

  it('late days are not deducted', () => {
    expect(payroll.calculate({ base: 50000, workingDays: 22, lateCount: 5, latePenalty: 500 }).deductions).toBe(0)
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
