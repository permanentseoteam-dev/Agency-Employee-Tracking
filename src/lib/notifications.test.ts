import { describe, expect, it } from 'vitest'
import { dateRange, daysText, notificationComment, notificationLink, notificationText, timeAgo, type LeavePayload } from './notifications'

const payload: LeavePayload = {
  request: 'r1',
  requester: 'e1',
  requester_name: 'Asma',
  leave_type_name: 'Sick',
  start_date: '2026-10-20',
  end_date: '2026-10-21',
  half_day: false,
  days: 2
}

describe('dateRange', () => {
  it.each([
    ['2026-10-20', '2026-10-20', '20 Oct 2026'],
    ['2026-10-20', '2026-10-22', '20–22 Oct 2026'],
    ['2026-10-30', '2026-11-02', '30 Oct – 2 Nov 2026'],
    ['2026-12-30', '2027-01-02', '30 Dec 2026 – 2 Jan 2027']
  ])('%s – %s → %s', (a, b, expected) => expect(dateRange(a, b)).toBe(expected))
})

describe('notificationText', () => {
  it('describes a new request for the manager', () => {
    expect(notificationText({ type: 'leave_requested', payload })).toEqual({
      title: 'Asma asked for leave',
      detail: 'Sick · 20–21 Oct 2026 · 2 days'
    })
  })

  it('describes a decision for the employee', () => {
    const decided = { ...payload, days: 0.5, half_day: true, end_date: '2026-10-20', status: 'rejected', decided_by_name: 'Imran' }
    expect(notificationText({ type: 'leave_decided', payload: decided })).toEqual({
      title: 'Your leave was rejected',
      detail: 'Sick · 20 Oct 2026 · Half day · by Imran'
    })
  })

  it('describes a self-registration for the admins', () => {
    expect(
      notificationText({ type: 'employee_registered', payload: { user: 'u9', name: 'Sara Self', email: 'sara@gmail.com' } })
    ).toEqual({ title: 'New employee registered', detail: 'Sara Self · sara@gmail.com · set their team, role and salary' })
  })

  it('asks the admins to approve a sign-up', () => {
    expect(
      notificationText({ type: 'signup_pending', payload: { user: 'u9', name: 'Sara Self', email: 'sara@gmail.com' } })
    ).toEqual({ title: 'New sign-up waiting for approval', detail: 'Sara Self · sara@gmail.com · approve or reject it in Organization' })
    expect(notificationLink({ type: 'signup_pending' }, 'admin')).toBe('/org/employees')
  })

  it('tells someone an admin gave them stars', () => {
    const stars = { record: 's1', rule_name: 'Phone in meetings', stars: 2, date: '2026-10-14', note: 'Client call', given_by_name: 'Ayesha' }
    expect(notificationText({ type: 'stars_given', payload: stars })).toEqual({
      title: 'You got 2 stars',
      detail: 'Phone in meetings · 14 Oct 2026 · Client call · by Ayesha'
    })
    expect(notificationText({ type: 'stars_given', payload: { ...stars, stars: 0, note: '' } }).title).toBe('A rule break was noted')
    expect(notificationLink({ type: 'stars_given' }, 'employee')).toBe('/my-attendance')
    // Managers and admins see their own attendance as a tab inside Attendance.
    expect(notificationLink({ type: 'stars_given' }, 'manager')).toBe('/attendance/mine')
  })

  it('copes with unknown types and empty payloads', () => {
    expect(notificationText({ type: 'something_else', payload })).toEqual({ title: 'Notification', detail: '' })
    expect(notificationText({ type: 'leave_requested', payload: null }).title).toBe('Notification')
  })

  it('counts days', () => {
    expect(daysText(1, false)).toBe('1 day')
    expect(daysText(2.5, false)).toBe('2.5 days')
  })

  it('shows a comment only for leave decisions that have one', () => {
    expect(notificationComment({ payload: { ...payload, comment: 'Enjoy' } })).toBe('Enjoy')
    expect(notificationComment({ payload })).toBe('')
    expect(notificationComment({ payload: { user: 'u9', name: 'Sara', email: 's@x.com' } })).toBe('')
    expect(notificationComment({ payload: null })).toBe('')
  })

  it('links to the right screen', () => {
    expect(notificationLink({ type: 'leave_requested' }, 'manager')).toBe('/my-leaves/pending')
    expect(notificationLink({ type: 'leave_decided' }, 'employee')).toBe('/my-leaves')
    expect(notificationLink({ type: 'employee_registered' }, 'admin')).toBe('/org/employees')
    expect(notificationLink({ type: 'x' }, 'employee')).toBeNull()
  })
})

describe('timeAgo', () => {
  const NOW = Date.parse('2026-10-14T09:00:00.000Z') // 14:00 in Karachi
  it.each([
    ['2026-10-14 08:59:30.000Z', 'just now'],
    ['2026-10-14 08:45:00.000Z', '15 min ago'],
    ['2026-10-14 05:00:00.000Z', '4 h ago'],
    ['2026-10-13 18:00:00.000Z', 'yesterday'], // 23:00 on the 13th in Karachi
    ['2026-10-10 05:00:00.000Z', '10 Oct 2026']
  ])('%s → %s', (value, expected) => expect(timeAgo(value, NOW)).toBe(expected))
})
