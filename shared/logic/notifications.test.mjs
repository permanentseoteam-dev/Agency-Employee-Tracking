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
