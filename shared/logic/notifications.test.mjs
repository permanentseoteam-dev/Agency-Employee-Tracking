import { describe, expect, it } from 'vitest'
import n from './notifications.js'

const ADMINS = ['admin1', 'admin2']

describe('requestRecipients', () => {
  it('sends an employee’s request to their team manager', () => {
    expect(n.requestRecipients({ id: 'e1', role: 'employee' }, 'm1', ADMINS)).toEqual(['m1'])
  })

  it('sends a manager’s own request to the admins', () => {
    expect(n.requestRecipients({ id: 'm1', role: 'manager' }, 'm1', ADMINS)).toEqual(ADMINS)
    expect(n.requestRecipients({ id: 'm2', role: 'manager' }, 'm1', ADMINS)).toEqual(ADMINS)
  })

  it('sends a request with no active team manager to the admins', () => {
    expect(n.requestRecipients({ id: 'e1', role: 'employee' }, '', ADMINS)).toEqual(ADMINS)
  })

  it('never notifies the requester about their own request', () => {
    expect(n.requestRecipients({ id: 'admin1', role: 'admin' }, '', ADMINS)).toEqual(['admin2'])
    expect(n.requestRecipients({ id: 'admin1', role: 'admin' }, '', ['admin1'])).toEqual([])
  })
})

describe('isEligibleTeamManager', () => {
  it('accepts an active manager or admin', () => {
    expect(n.isEligibleTeamManager({ id: 'm1', active: true, role: 'manager' })).toBe(true)
    expect(n.isEligibleTeamManager({ id: 'a1', active: true, role: 'admin', pending_approval: false })).toBe(true)
  })

  it('refuses a manager who was demoted to employee', () => {
    expect(n.isEligibleTeamManager({ id: 'm1', active: true, role: 'employee' })).toBe(false)
  })

  it('refuses an inactive or unapproved account, or none at all', () => {
    expect(n.isEligibleTeamManager({ id: 'm1', active: false, role: 'manager' })).toBe(false)
    expect(n.isEligibleTeamManager({ id: 'm1', active: true, role: 'manager', pending_approval: true })).toBe(false)
    expect(n.isEligibleTeamManager(null)).toBe(false)
    expect(n.isEligibleTeamManager(undefined)).toBe(false)
  })

  it('sends the request to the admins when the team manager was demoted', () => {
    const demoted = { id: 'm1', active: true, role: 'employee' }
    const managerId = n.isEligibleTeamManager(demoted) ? demoted.id : ''
    expect(n.requestRecipients({ id: 'e1', role: 'employee' }, managerId, ADMINS)).toEqual(ADMINS)
  })
})

describe('when to notify', () => {
  it('notifies for new pending requests only', () => {
    expect(n.isNewRequest('pending')).toBe(true)
    expect(n.isNewRequest('')).toBe(true)
    expect(n.isNewRequest('approved')).toBe(false)
  })

  it.each([
    ['pending', 'approved', true],
    ['pending', 'rejected', true],
    ['approved', 'rejected', true],
    ['pending', 'cancelled', false],
    ['approved', 'approved', false],
    ['pending', 'pending', false]
  ])('%s → %s notifies: %s', (before, after, expected) => {
    expect(n.isDecision(before, after)).toBe(expected)
  })
})

describe('payloads', () => {
  const req = { id: 'r1', user: 'e1', start_date: '2026-10-20', end_date: '2026-10-21', half_day: false, days: 2, status: 'approved', comment: 'Get well soon' }

  it('describes the request', () => {
    expect(n.requestPayload(req, { requester: 'Asma', leaveType: 'Sick' })).toEqual({
      request: 'r1',
      requester: 'e1',
      requester_name: 'Asma',
      leave_type_name: 'Sick',
      start_date: '2026-10-20',
      end_date: '2026-10-21',
      half_day: false,
      days: 2
    })
  })

  it('adds the decision', () => {
    expect(n.decisionPayload(req, { requester: 'Asma', leaveType: 'Sick', approver: 'Imran' })).toMatchObject({
      status: 'approved',
      decided_by_name: 'Imran',
      comment: 'Get well soon'
    })
  })
})
