import { describe, expect, it } from 'vitest'
import {
  allowedMoves,
  balanceRows,
  countLeaveDays,
  formatDays,
  quotaLeft,
  validateLeave,
  type LeaveContext,
  type LeaveInput,
  type LeaveTypeInfo
} from './leave'

const MON_FRI = [1, 2, 3, 4, 5]
const SICK: LeaveTypeInfo = { id: 'sick', name: 'Sick', yearly_quota_days: 8, paid: true }
const UNPAID: LeaveTypeInfo = { id: 'unpaid', name: 'Unpaid', yearly_quota_days: 0, paid: false }

const ctx = (extra: Partial<LeaveContext> = {}): LeaveContext => ({
  workDays: MON_FRI,
  holidays: new Set(['2026-10-21']),
  types: [SICK, UNPAID],
  mine: [],
  ...extra
})
const input = (extra: Partial<LeaveInput> = {}): LeaveInput => ({
  leave_type: 'sick',
  start_date: '2026-10-19',
  end_date: '2026-10-23',
  half_day: false,
  reason: '',
  ...extra
})

describe('countLeaveDays', () => {
  it('counts working days, leaving out weekends and holidays', () => {
    expect(countLeaveDays('2026-10-16', '2026-10-20', false, MON_FRI, new Set())).toBe(3)
    expect(countLeaveDays('2026-10-19', '2026-10-23', false, MON_FRI, new Set(['2026-10-21']))).toBe(4)
  })

  it('counts a half day as 0.5 only on a working day', () => {
    expect(countLeaveDays('2026-10-19', '2026-10-19', true, MON_FRI, new Set())).toBe(0.5)
    expect(countLeaveDays('2026-10-18', '2026-10-18', true, MON_FRI, new Set())).toBe(0)
  })

  it('is 0 for invalid or reversed dates', () => {
    expect(countLeaveDays('', '2026-10-19', false, MON_FRI, new Set())).toBe(0)
    expect(countLeaveDays('2026-10-20', '2026-10-19', false, MON_FRI, new Set())).toBe(0)
  })
})

describe('validateLeave', () => {
  it('previews the days for a valid request', () => {
    expect(validateLeave(input(), ctx())).toEqual({ errors: {}, days: 4 })
    expect(validateLeave(input({ end_date: '2026-10-19', half_day: true }), ctx())).toEqual({ errors: {}, days: 0.5 })
  })

  it('matches the server’s date rules', () => {
    expect(validateLeave(input({ leave_type: '' }), ctx()).errors.leave_type).toMatch(/leave type/)
    expect(validateLeave(input({ end_date: '2026-10-18' }), ctx()).errors.end_date).toMatch(/on or after/)
    expect(validateLeave(input({ start_date: '2026-12-31', end_date: '2027-01-01' }), ctx()).errors.end_date).toMatch(/new year/)
    expect(validateLeave(input({ start_date: '2026-01-01', end_date: '2026-03-02' }), ctx()).errors.end_date).toMatch(/at most 60/)
    expect(validateLeave(input({ half_day: true }), ctx()).errors.half_day).toMatch(/same day/)
    expect(validateLeave(input({ start_date: '2026-10-17', end_date: '2026-10-18' }), ctx()).errors.end_date).toMatch(/no working days/)
    expect(validateLeave(input(), ctx({ joinedOn: '2026-10-20' })).errors.start_date).toMatch(/joining date/)
  })

  it('refuses overlap with pending or approved leave, not with cancelled or rejected', () => {
    const mine = [{ id: 'r1', leave_type: 'sick', start_date: '2026-10-22', end_date: '2026-10-22', days: 1, status: 'pending' as const }]
    expect(validateLeave(input(), ctx({ mine })).errors.start_date).toMatch(/overlap your pending/)
    expect(validateLeave(input(), ctx({ mine: [{ ...mine[0], status: 'rejected' }] })).errors).toEqual({})
  })

  it('checks the paid quota (approved + pending this year) but not unpaid leave', () => {
    const mine = [
      { id: 'r1', leave_type: 'sick', start_date: '2026-03-02', end_date: '2026-03-03', days: 2, status: 'approved' as const },
      { id: 'r2', leave_type: 'sick', start_date: '2026-04-06', end_date: '2026-04-08', days: 3, status: 'pending' as const },
      { id: 'r3', leave_type: 'sick', start_date: '2025-04-06', end_date: '2025-04-10', days: 5, status: 'approved' as const }
    ]
    expect(validateLeave(input(), ctx({ mine })).errors.leave_type).toBe('Only 3 days of Sick leave left this year; this request needs 4.')
    expect(validateLeave(input({ leave_type: 'unpaid' }), ctx({ mine })).errors).toEqual({})
  })
})

describe('quotaLeft and balanceRows', () => {
  const mine = [
    { id: 'r1', leave_type: 'sick', start_date: '2026-03-02', end_date: '2026-03-03', days: 2, status: 'approved' as const },
    { id: 'r2', leave_type: 'sick', start_date: '2026-04-06', end_date: '2026-04-06', days: 0.5, status: 'pending' as const },
    { id: 'r3', leave_type: 'sick', start_date: '2026-05-04', end_date: '2026-05-04', days: 1, status: 'cancelled' as const },
    { id: 'r4', leave_type: 'unpaid', start_date: '2026-06-01', end_date: '2026-06-05', days: 5, status: 'approved' as const }
  ]

  it('works out what is left', () => {
    expect(quotaLeft(SICK, mine, '2026')).toBe(5.5)
    expect(quotaLeft(UNPAID, mine, '2026')).toBe(Infinity)
  })

  it('lists quota, used, pending and left per type', () => {
    expect(balanceRows([SICK, UNPAID], mine, '2026')).toEqual([
      { type: SICK, quota: 8, used: 2, pending: 0.5, left: 5.5 },
      { type: UNPAID, quota: null, used: 5, pending: 0, left: null }
    ])
  })
})

describe('allowedMoves', () => {
  const emp = { id: 'e1', role: 'employee' as const }
  const mgr = { id: 'm1', role: 'manager' as const }
  const admin = { id: 'a1', role: 'admin' as const }

  it('lets the owner cancel only while pending', () => {
    expect(allowedMoves(emp, { user: 'e1', status: 'pending' })).toEqual(['cancelled'])
    expect(allowedMoves(emp, { user: 'e1', status: 'approved' })).toEqual([])
    expect(allowedMoves(mgr, { user: 'm1', status: 'pending', requesterRole: 'manager' })).toEqual(['cancelled'])
  })

  it('lets a manager decide an employee’s pending request only', () => {
    expect(allowedMoves(mgr, { user: 'e1', status: 'pending', requesterRole: 'employee' })).toEqual(['approved', 'rejected'])
    expect(allowedMoves(mgr, { user: 'e1', status: 'approved', requesterRole: 'employee' })).toEqual([])
    expect(allowedMoves(mgr, { user: 'm2', status: 'pending', requesterRole: 'manager' })).toEqual([])
  })

  it('gives admins the overrides', () => {
    expect(allowedMoves(admin, { user: 'm1', status: 'pending', requesterRole: 'manager' })).toEqual(['approved', 'rejected'])
    expect(allowedMoves(admin, { user: 'e1', status: 'approved' })).toEqual(['rejected', 'cancelled'])
    expect(allowedMoves(admin, { user: 'e1', status: 'rejected' })).toEqual(['approved'])
    expect(allowedMoves(admin, { user: 'e1', status: 'cancelled' })).toEqual([])
  })

  it('never lets an employee decide', () => {
    expect(allowedMoves(emp, { user: 'e2', status: 'pending' })).toEqual([])
  })
})

describe('formatDays', () => {
  it('words the count', () => {
    expect(formatDays(1)).toBe('1 day')
    expect(formatDays(0.5)).toBe('0.5 day')
    expect(formatDays(4)).toBe('4 days')
  })
})
