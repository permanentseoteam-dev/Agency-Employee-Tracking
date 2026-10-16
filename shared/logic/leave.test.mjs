import { describe, expect, it } from 'vitest'
import l from './leave.js'

const MON_FRI = [1, 2, 3, 4, 5]
const EMP = { id: 'e1', role: 'employee' }
const MGR = { id: 'm1', role: 'manager' }
const MGR2 = { id: 'm2', role: 'manager' }
const ADMIN = { id: 'a1', role: 'admin' }
const ADMIN2 = { id: 'a2', role: 'admin' }

describe('checkDates', () => {
  it('accepts a normal range and a single half day', () => {
    expect(l.checkDates('2026-10-19', '2026-10-23', false)).toBeNull()
    expect(l.checkDates('2026-10-19', '2026-10-19', true)).toBeNull()
  })

  it('rejects invalid dates and an end before the start', () => {
    expect(l.checkDates('2026-02-30', '2026-03-02', false)).toMatch(/start date/)
    expect(l.checkDates('2026-10-19', '19-10-2026', false)).toMatch(/end date/)
    expect(l.checkDates('2026-10-20', '2026-10-19', false)).toMatch(/on or after/)
  })

  it('rejects a range across the new year', () => {
    expect(l.checkDates('2026-12-30', '2027-01-02', false)).toMatch(/new year/)
  })

  it('allows at most 60 calendar days', () => {
    expect(l.checkDates('2026-01-01', '2026-03-01', false)).toBeNull() // 60 days
    expect(l.checkDates('2026-01-01', '2026-03-02', false)).toMatch(/at most 60/)
  })

  it('allows a half day only on a single day', () => {
    expect(l.checkDates('2026-10-19', '2026-10-20', true)).toMatch(/half day/)
  })
})

describe('countDays', () => {
  it('counts working days only (Mon–Fri)', () => {
    // Fri 16 Oct – Tue 20 Oct 2026: Fri, Mon, Tue
    expect(l.countDays('2026-10-16', '2026-10-20', false, MON_FRI, [])).toBe(3)
  })

  it('leaves out holidays (as day keys or records)', () => {
    expect(l.countDays('2026-10-19', '2026-10-23', false, MON_FRI, ['2026-10-21'])).toBe(4)
    expect(l.countDays('2026-10-19', '2026-10-23', false, MON_FRI, [{ date: '2026-10-21' }, { date: '2026-10-22' }])).toBe(3)
  })

  it('counts a half day on a working day as 0.5, and 0 on a day off', () => {
    expect(l.countDays('2026-10-19', '2026-10-19', true, MON_FRI, [])).toBe(0.5)
    expect(l.countDays('2026-10-17', '2026-10-17', true, MON_FRI, [])).toBe(0)
  })

  it('follows the org work days (e.g. a six-day week)', () => {
    expect(l.countDays('2026-10-17', '2026-10-18', false, [1, 2, 3, 4, 5, 6], [])).toBe(1)
  })
})

describe('evaluateRequest', () => {
  const ctx = { workDays: MON_FRI, holidays: ['2026-10-21'], user: { joined_on: '2026-03-01', left_on: '' } }

  it('returns the counted days', () => {
    expect(l.evaluateRequest({ start_date: '2026-10-19', end_date: '2026-10-23' }, ctx)).toEqual({ days: 4 })
    expect(l.evaluateRequest({ start_date: '2026-10-19', end_date: '2026-10-19', half_day: true }, ctx)).toEqual({ days: 0.5 })
  })

  it('allows past dates (sick leave sent afterwards)', () => {
    expect(l.evaluateRequest({ start_date: '2026-04-06', end_date: '2026-04-06' }, ctx)).toEqual({ days: 1 })
  })

  it('rejects a range with no working days', () => {
    expect(l.evaluateRequest({ start_date: '2026-10-17', end_date: '2026-10-18' }, ctx).error).toMatch(/no working days/)
    expect(l.evaluateRequest({ start_date: '2026-10-21', end_date: '2026-10-21', half_day: true }, ctx).error).toMatch(/isn’t a working day/)
  })

  it('rejects dates outside the employment', () => {
    expect(l.evaluateRequest({ start_date: '2026-02-27', end_date: '2026-03-02' }, ctx).error).toMatch(/joining date/)
    const leaving = { ...ctx, user: { joined_on: '', left_on: '2026-10-20' } }
    expect(l.evaluateRequest({ start_date: '2026-10-19', end_date: '2026-10-22' }, leaving).error).toMatch(/leaving date/)
  })
})

describe('quotaProblem', () => {
  const sick = { name: 'Sick', paid: true, yearly_quota_days: 8 }

  it('allows paid leave up to the quota', () => {
    expect(l.quotaProblem(sick, 5, 3)).toBeNull()
    expect(l.quotaProblem(sick, 7.5, 0.5)).toBeNull()
  })

  it('refuses paid leave past the quota, saying what is left', () => {
    expect(l.quotaProblem(sick, 6, 3)).toBe('Only 2 days of Sick leave left this year; this request needs 3.')
    expect(l.quotaProblem(sick, 7, 2)).toMatch(/Only 1 day of Sick/)
    expect(l.quotaProblem(sick, 8, 1)).toBe('No Sick leave left this year (quota 8 days).')
  })

  it('never limits unpaid leave', () => {
    expect(l.quotaProblem({ name: 'Unpaid', paid: false, yearly_quota_days: 0 }, 40, 20)).toBeNull()
  })
})

describe('leave per month', () => {
  it('splits a request’s working days by month', () => {
    // Thu 29 Oct – Tue 3 Nov 2026: Thu, Fri in October; Mon, Tue in November
    expect(l.leaveByMonth('2026-10-29', '2026-11-03', false, MON_FRI, [])).toEqual({
      '2026-10': { full: 2, half: 0 },
      '2026-11': { full: 2, half: 0 }
    })
    expect(l.leaveByMonth('2026-10-29', '2026-11-03', false, MON_FRI, ['2026-11-02'])['2026-11']).toEqual({ full: 1, half: 0 })
  })

  it('counts a half day (short leave) once, on a working day only', () => {
    expect(l.leaveByMonth('2026-10-20', '2026-10-20', true, MON_FRI, [])).toEqual({ '2026-10': { full: 0, half: 1 } })
    expect(l.leaveByMonth('2026-10-24', '2026-10-24', true, MON_FRI, [])).toEqual({}) // Saturday
  })

  it('adds up other requests inside one month', () => {
    const requests = [
      { start_date: '2026-10-05', end_date: '2026-10-06', half_day: false },
      { start_date: '2026-10-29', end_date: '2026-11-03', half_day: false },
      { start_date: '2026-10-20', end_date: '2026-10-20', half_day: true },
      { start_date: '2026-11-10', end_date: '2026-11-10', half_day: true }
    ]
    expect(l.monthTotals(requests, '2026-10', MON_FRI, [])).toEqual({ full: 4, half: 1 })
    expect(l.monthTotals(requests, '2026-11', MON_FRI, [])).toEqual({ full: 2, half: 1 })
  })
})

describe('monthlyLimitProblem', () => {
  const limits = { full: 2, half: 3 }

  it('allows leave up to each limit', () => {
    expect(l.monthlyLimitProblem(limits, '2026-10', { full: 1, half: 2 }, { full: 1, half: 0 })).toBeNull()
    expect(l.monthlyLimitProblem(limits, '2026-10', { full: 2, half: 2 }, { full: 0, half: 1 })).toBeNull()
  })

  it('refuses full days past the limit, saying what is left', () => {
    expect(l.monthlyLimitProblem(limits, '2026-10', { full: 1, half: 0 }, { full: 3, half: 0 })).toBe(
      'Only 1 full day of leave left in October (limit 2 a month); this request needs 3.'
    )
    expect(l.monthlyLimitProblem(limits, '2026-10', { full: 2, half: 0 }, { full: 1, half: 0 })).toBe(
      'No full-day leave left in October (limit 2 a month).'
    )
  })

  it('refuses half days (short leave) past their own limit', () => {
    expect(l.monthlyLimitProblem(limits, '2026-11', { full: 0, half: 3 }, { full: 0, half: 1 })).toBe(
      'No half-day (short) leave left in November (limit 3 a month).'
    )
  })

  it('counts full days and half days separately', () => {
    expect(l.monthlyLimitProblem(limits, '2026-10', { full: 2, half: 0 }, { full: 0, half: 1 })).toBeNull()
    expect(l.monthlyLimitProblem(limits, '2026-10', { full: 0, half: 3 }, { full: 2, half: 0 })).toBeNull()
  })

  it('0 means no limit', () => {
    expect(l.monthlyLimitProblem({ full: 0, half: 0 }, '2026-10', { full: 20, half: 9 }, { full: 5, half: 1 })).toBeNull()
    expect(l.monthlyLimitProblem({ full: 0, half: 1 }, '2026-10', { full: 20, half: 0 }, { full: 5, half: 0 })).toBeNull()
  })
})

describe('decisionProblem', () => {
  it('lets the owner cancel only while pending', () => {
    expect(l.decisionProblem(EMP, EMP, 'pending', 'cancelled')).toBeNull()
    expect(l.decisionProblem(EMP, EMP, 'approved', 'cancelled')).toMatch(/only cancel/)
  })

  it('never lets anyone decide their own request', () => {
    expect(l.decisionProblem(EMP, EMP, 'pending', 'approved')).toMatch(/own leave/)
    expect(l.decisionProblem(MGR, MGR, 'pending', 'approved')).toMatch(/own leave/)
    expect(l.decisionProblem(ADMIN, ADMIN, 'pending', 'rejected')).toMatch(/own leave/)
  })

  it('lets a manager approve or reject an employee’s pending request', () => {
    expect(l.decisionProblem(MGR, EMP, 'pending', 'approved')).toBeNull()
    expect(l.decisionProblem(MGR, EMP, 'pending', 'rejected')).toBeNull()
  })

  it('sends managers’ and admins’ requests to the admins', () => {
    expect(l.decisionProblem(MGR2, MGR, 'pending', 'approved')).toMatch(/decided by an admin/)
    expect(l.decisionProblem(MGR, ADMIN, 'pending', 'approved')).toMatch(/decided by an admin/)
    expect(l.decisionProblem(ADMIN, MGR, 'pending', 'approved')).toBeNull()
    expect(l.decisionProblem(ADMIN2, ADMIN, 'pending', 'approved')).toBeNull()
  })

  it('stops an employee from deciding anyone’s request', () => {
    expect(l.decisionProblem(EMP, { id: 'e2', role: 'employee' }, 'pending', 'approved')).toMatch(/Only managers and admins/)
  })

  it('lets only an admin change a decision', () => {
    expect(l.decisionProblem(MGR, EMP, 'approved', 'rejected')).toMatch(/Only an admin/)
    expect(l.decisionProblem(ADMIN, EMP, 'approved', 'rejected')).toBeNull()
    expect(l.decisionProblem(ADMIN, EMP, 'rejected', 'approved')).toBeNull()
    expect(l.decisionProblem(ADMIN, EMP, 'approved', 'cancelled')).toBeNull()
    expect(l.decisionProblem(ADMIN, EMP, 'rejected', 'cancelled')).toMatch(/only be approved/)
  })

  it('refuses no-op, back-to-pending and reopening a cancelled request', () => {
    expect(l.decisionProblem(ADMIN, EMP, 'approved', 'approved')).toMatch(/already approved/)
    expect(l.decisionProblem(ADMIN, EMP, 'approved', 'pending')).toMatch(/back to pending/)
    expect(l.decisionProblem(ADMIN, EMP, 'cancelled', 'approved')).toMatch(/cancelled request/)
  })

  it('leaves cancelling a pending request to the employee', () => {
    expect(l.decisionProblem(MGR, EMP, 'pending', 'cancelled')).toMatch(/only the employee/)
  })
})

describe('lockedFieldProblem', () => {
  it('lets the owner change only the status', () => {
    expect(l.lockedFieldProblem(['status'], true)).toBeNull()
    expect(l.lockedFieldProblem(['status', 'end_date'], true)).toMatch(/can’t be edited/)
    expect(l.lockedFieldProblem(['comment'], true)).toMatch(/can’t be edited/)
  })

  it('lets staff change only the status and comment', () => {
    expect(l.lockedFieldProblem(['status', 'comment'], false)).toBeNull()
    expect(l.lockedFieldProblem(['status', 'days', 'leave_type'], false)).toMatch(/not: days, leave_type/)
  })

  it('ignores the server-set fields', () => {
    expect(l.lockedFieldProblem(['status', 'approver', 'decided_at'], false)).toBeNull()
  })
})

describe('isStaffDecision', () => {
  it('stamps staff decisions but not the owner’s own cancel', () => {
    expect(l.isStaffDecision('m1', 'e1', 'approved')).toBe(true)
    expect(l.isStaffDecision('a1', 'e1', 'cancelled')).toBe(true)
    expect(l.isStaffDecision('e1', 'e1', 'cancelled')).toBe(false)
  })
})

describe('attendanceDaysToRecount', () => {
  it('recounts finished days when approved leave appears or goes away', () => {
    expect(l.attendanceDaysToRecount('pending', 'approved', '2026-10-12', '2026-10-16', '2026-10-14')).toEqual([
      '2026-10-12',
      '2026-10-13'
    ])
    expect(l.attendanceDaysToRecount('approved', 'cancelled', '2026-10-05', '2026-10-06', '2026-10-14')).toEqual([
      '2026-10-05',
      '2026-10-06'
    ])
  })

  it('does nothing for future leave or when approval does not change', () => {
    expect(l.attendanceDaysToRecount('pending', 'approved', '2026-10-14', '2026-10-16', '2026-10-14')).toEqual([])
    expect(l.attendanceDaysToRecount('pending', 'rejected', '2026-10-05', '2026-10-06', '2026-10-14')).toEqual([])
    expect(l.attendanceDaysToRecount('rejected', 'approved', '2026-10-05', '2026-10-05', '2026-10-14')).toEqual(['2026-10-05'])
  })
})
