import { describe, expect, it } from 'vitest'
import { breakdown, formatAdjustment, formatPkr, midMonth, payrollCsv, runTotals, type PayrollItem } from './payroll'

// The hand calculation from server/pb_hooks/lib/payroll.test.mjs, as stored.
const item: PayrollItem = {
  id: 'i1',
  run: 'r1',
  user: 'u1',
  base: 100000,
  working_days: 21,
  absent_days: 2,
  unpaid_leave_days: 1,
  half_days: 1,
  late_count: 3,
  deductions: 18167,
  adjustment_pkr: -20000,
  note: 'Left on the 18th',
  net: 61833
}

describe('formatting', () => {
  it('formats rupees', () => {
    expect(formatPkr(100000)).toBe('PKR 100,000')
    expect(formatPkr(-5000)).toBe('−PKR 5,000')
    expect(formatPkr(4761.904, 2)).toBe('PKR 4,761.90')
  })

  it('shows adjustments with a sign', () => {
    expect(formatAdjustment(5000)).toBe('+PKR 5,000')
    expect(formatAdjustment(-20000)).toBe('−PKR 20,000')
    expect(formatAdjustment(0)).toBe('—')
  })
})

describe('breakdown', () => {
  it('explains the deductions of the hand calculation', () => {
    const b = breakdown(item)
    expect(b.rate).toBeCloseTo(4761.9048, 4)
    expect(b.absent).toBeCloseTo(9523.81, 2)
    expect(b.unpaidLeave).toBeCloseTo(4761.9, 2)
    expect(b.halfDays).toBeCloseTo(2380.95, 2)
    expect(b.late).toBe(1500)
    expect(b.latePenalty).toBe(500)
  })
})

describe('mid-month joiners and leavers', () => {
  it.each([
    [{ joined_on: '2026-10-15' }, 'joined'],
    [{ joined_on: '2026-10-01' }, null],
    [{ joined_on: '2026-01-01', left_on: '2026-10-18' }, 'left'],
    [{ joined_on: '2026-01-01', left_on: '2026-11-02' }, null]
  ])('%o → %s', (person, expected) => expect(midMonth(person, '2026-10')).toBe(expected))
})

describe('totals and CSV', () => {
  const other = { ...item, id: 'i2', user: 'u2', base: 50000, deductions: 0, adjustment_pkr: 5000, note: 'Bonus, Q3', net: 55000 }

  it('adds up the run', () => {
    expect(runTotals([item, other])).toEqual({ base: 150000, deductions: 18167, adjustments: -15000, net: 116833 })
  })

  it('exports a line per employee and a total', () => {
    const lines = payrollCsv([item, other], (id) => (id === 'u1' ? 'Asma Khan' : 'Bilal')).replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('Employee,Monthly salary,Working days,Absent,Unpaid leave,Half days,Late,Deductions,Adjustment,Note,Net pay')
    expect(lines[1]).toBe('Asma Khan,100000,21,2,1,1,3,18167,-20000,Left on the 18th,61833')
    expect(lines[2]).toBe('Bilal,50000,21,2,1,1,3,0,5000,"Bonus, Q3",55000')
    expect(lines[3]).toBe('Total,150000,,,,,,18167,-15000,,116833')
  })
})
