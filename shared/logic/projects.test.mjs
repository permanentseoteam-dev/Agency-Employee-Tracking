import { describe, expect, it } from 'vitest'
import att from './attendance.js'
import lib from './projects.js'

const SETTINGS = {
  shift_start: '09:00',
  shift_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  grace_minutes: 15,
  half_day_min_hours: 4,
  full_day_min_hours: 8,
  timezone: 'Asia/Karachi'
}
const OFFSET = 300
const MONDAY = '2026-10-12'
const SATURDAY = '2026-10-17'

/** Milliseconds of a Karachi wall-clock time on a day. */
const at = (day, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(`${day}T00:00:00.000Z`) + (h * 60 + m - OFFSET) * 60000
}
const seg = (day, local, minutes) => ({
  state: 'active',
  started_at: new Date(at(day, local)).toISOString().replace('T', ' '),
  ended_at: new Date(at(day, local) + minutes * 60000).toISOString().replace('T', ' ')
})
/** The live status at a Karachi time, given the day's segments, leave and holidays so far. */
const liveAt = (local, segments = [], leaves = [], holidays = [], day = MONDAY) =>
  lib.liveStatus(att.statusFor(day, SETTINGS, segments, leaves, holidays), { ...lib.shiftTimes(day, SETTINGS, OFFSET), now: at(day, local) })

describe('liveStatus: today while it is still running', () => {
  it('reads "Not in yet" before anyone starts, and Absent once the shift is over', () => {
    expect(liveAt('08:30')).toBe('not_in_yet')
    expect(liveAt('17:59')).toBe('not_in_yet')
    expect(liveAt('18:00')).toBe('absent')
  })

  it('is Present or Late as soon as someone starts, not Half day', () => {
    expect(liveAt('09:30', [seg(MONDAY, '09:05', 20)])).toBe('present')
    expect(liveAt('10:00', [seg(MONDAY, '09:20', 30)])).toBe('late')
  })

  it('a short day stays Present after the shift (short hours give stars, not a status)', () => {
    const short = [seg(MONDAY, '09:00', 120)]
    expect(liveAt('17:00', short)).toBe('present')
    expect(liveAt('18:30', short)).toBe('present')
  })

  it('a half-day leave with no activity reads On leave', () => {
    expect(liveAt('10:00', [], [{ status: 'approved', start_date: MONDAY, end_date: MONDAY, half_day: true }])).toBe('on_leave')
  })

  it('keeps leave, holidays and weekends as they are', () => {
    expect(liveAt('10:00', [], [{ status: 'approved', start_date: MONDAY, end_date: MONDAY }])).toBe('on_leave')
    expect(liveAt('10:00', [], [], [MONDAY])).toBe('holiday')
    expect(liveAt('10:00', [], [], [], SATURDAY)).toBe('weekend')
  })

  it('places the shift in the org timezone', () => {
    const t = lib.shiftTimes(MONDAY, SETTINGS, OFFSET)
    expect(new Date(t.shiftStart).toISOString()).toBe('2026-10-12T04:00:00.000Z')
    expect(t.graceEnd - t.shiftStart).toBe(15 * 60000)
    expect(new Date(t.shiftEnd).toISOString()).toBe('2026-10-12T13:00:00.000Z')
  })
})

describe('monthCounts', () => {
  it('counts the four statuses and ignores holidays, weekends and old half days', () => {
    const records = ['present', 'present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'weekend'].map((status) => ({ status }))
    expect(lib.monthCounts(records)).toEqual({ present: 2, late: 1, absent: 1, on_leave: 1 })
    expect(lib.monthCounts([])).toEqual({ present: 0, late: 0, absent: 0, on_leave: 0 })
  })
})

describe('canSee', () => {
  const client = { archived: false, members: ['u1', 'u2'] }
  it('lets admins and members in, and nobody else', () => {
    expect(lib.canSee(client, { id: 'boss', role: 'admin' })).toBe(true)
    expect(lib.canSee(client, { id: 'u1', role: 'employee' })).toBe(true)
    expect(lib.canSee(client, { id: 'u9', role: 'manager' })).toBe(false)
    expect(lib.canSee(client, null)).toBe(false)
  })
  it('hides an archived client from its members, not from admins', () => {
    const old = { ...client, archived: true }
    expect(lib.canSee(old, { id: 'u1', role: 'employee' })).toBe(false)
    expect(lib.canSee(old, { id: 'boss', role: 'admin' })).toBe(true)
  })
})

describe('query parsing', () => {
  const today = '2026-10-15'
  it('status: needs a client; the date defaults to today and cannot be later', () => {
    expect(lib.parseStatusQuery({}, today).error).toBe('Pick a client.')
    expect(lib.parseStatusQuery({ client: 'c1' }, today).data).toEqual({ client: 'c1', date: today })
    expect(lib.parseStatusQuery({ client: 'c1', date: '2026-10-01' }, today).data.date).toBe('2026-10-01')
    expect(lib.parseStatusQuery({ client: 'c1', date: '2026-10-16' }, today).error).toBe('Pick today or an earlier day.')
    expect(lib.parseStatusQuery({ client: 'c1', date: '15/10/2026' }, today).error).toBe('Pick a valid date.')
  })
  it('leaves: a valid range of at most 62 days', () => {
    expect(lib.parseLeaveQuery({ client: 'c1', from: '2026-09-28', to: '2026-11-08' }).data).toEqual({ client: 'c1', from: '2026-09-28', to: '2026-11-08' })
    expect(lib.parseLeaveQuery({ client: 'c1', from: '2026-10-10', to: '2026-10-01' }).error).toBe('The end date is before the start date.')
    expect(lib.parseLeaveQuery({ client: 'c1', from: '2026-01-01', to: '2026-12-31' }).error).toBe('Pick at most 62 days.')
    expect(lib.parseLeaveQuery({ from: '2026-10-01', to: '2026-10-02' }).error).toBe('Pick a client.')
  })
})

describe('eventTimesProblem', () => {
  it('needs an end after the start', () => {
    expect(lib.eventTimesProblem('2026-10-15 05:00:00.000Z', '2026-10-15 06:00:00.000Z')).toBeNull()
    expect(lib.eventTimesProblem('2026-10-15 05:00:00.000Z', '2026-10-15 05:00:00.000Z')).toBe('An event has to end after it starts.')
    expect(lib.eventTimesProblem('', '2026-10-15 05:00:00.000Z')).toBe('Pick a start and an end.')
  })
})
