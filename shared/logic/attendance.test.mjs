import { describe, expect, it } from 'vitest'
import att from './attendance.js'
import payroll from './payroll.js'

const SETTINGS = {
  shift_start: '09:00',
  shift_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  grace_minutes: 15,
  half_day_min_hours: 4,
  full_day_min_hours: 8,
  timezone: 'Asia/Karachi'
}
const MONDAY = '2026-10-12'
const SATURDAY = '2026-10-17'

/** A segment from a Karachi wall-clock time ("HH:mm" or "HH:mm:ss"), lasting some minutes. */
function seg(state, local, minutes, day = MONDAY) {
  const [h, m, s = 0] = local.split(':').map(Number)
  const start = Date.parse(`${day}T00:00:00.000Z`) + ((h * 60 + m - 300) * 60 + s) * 1000
  return {
    state,
    started_at: new Date(start).toISOString().replace('T', ' '),
    ended_at: new Date(start + minutes * 60000).toISOString().replace('T', ' ')
  }
}
const workedDay = (firstLocal) => [seg('active', firstLocal, 270), seg('idle', '13:45', 30), seg('active', '14:15', 60)]

describe('statusFor: one case per status, in the order of plan §4.2', () => {
  it('holiday', () => {
    expect(att.statusFor(MONDAY, SETTINGS, workedDay('09:00'), [], [MONDAY]).status).toBe('holiday')
  })

  it('weekend', () => {
    expect(att.statusFor(SATURDAY, SETTINGS, [], [], []).status).toBe('weekend')
  })

  it('on leave (an approved leave covers the day, even with activity)', () => {
    const leave = { start_date: '2026-10-11', end_date: '2026-10-13', status: 'approved' }
    expect(att.statusFor(MONDAY, SETTINGS, workedDay('09:00'), [leave], []).status).toBe('on_leave')
  })

  it('absent (no active time on a working day; idle alone does not count)', () => {
    const r = att.statusFor(MONDAY, SETTINGS, [seg('idle', '09:00', 120)], [], [])
    expect(r).toMatchObject({ status: 'absent', active_s: 0, idle_s: 7200, first_activity_at: '', last_activity_at: '' })
  })

  it('half day (active time under the half-day minimum)', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [seg('active', '09:00', 239)], [], []).status).toBe('half_day')
  })

  it('late (first activity after shift start + grace)', () => {
    expect(att.statusFor(MONDAY, SETTINGS, workedDay('09:16'), [], []).status).toBe('late')
  })

  it('present', () => {
    const r = att.statusFor(MONDAY, SETTINGS, workedDay('09:10'), [], [])
    expect(r).toEqual({
      date: MONDAY,
      status: 'present',
      active_s: 330 * 60,
      idle_s: 30 * 60,
      first_activity_at: '2026-10-12 04:10:00.000Z',
      last_activity_at: '2026-10-12 10:15:00.000Z'
    })
  })
})

describe('statusFor: boundaries', () => {
  it('first activity exactly at the end of the grace period is still on time', () => {
    expect(att.statusFor(MONDAY, SETTINGS, workedDay('09:15'), [], []).status).toBe('present')
    expect(att.statusFor(MONDAY, SETTINGS, workedDay('09:15:01'), [], []).status).toBe('late')
  })

  it('grace 0 makes any minute after shift start late', () => {
    expect(att.statusFor(MONDAY, { ...SETTINGS, grace_minutes: 0 }, workedDay('09:01'), [], []).status).toBe('late')
  })

  it('exactly the half-day minimum is not a half day', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [seg('active', '09:00', 240)], [], []).status).toBe('present')
  })

  it('a holiday on a weekend shows as the holiday', () => {
    expect(att.statusFor(SATURDAY, SETTINGS, [], [], [{ date: SATURDAY }]).status).toBe('holiday')
  })

  it('follows the org’s working days (e.g. Monday–Saturday)', () => {
    expect(att.statusFor(SATURDAY, { ...SETTINGS, work_days: [1, 2, 3, 4, 5, 6] }, [], [], []).status).toBe('absent')
  })

  it('ignores leave that is not approved, or does not cover the day', () => {
    const leaves = [
      { start_date: MONDAY, end_date: MONDAY, status: 'pending' },
      { start_date: '2026-10-13', end_date: '2026-10-14', status: 'approved' }
    ]
    expect(att.statusFor(MONDAY, SETTINGS, [], leaves, []).status).toBe('absent')
  })

  it('skips broken segments', () => {
    const broken = { state: 'active', started_at: '2026-10-12 05:00:00.000Z', ended_at: '2026-10-12 04:00:00.000Z' }
    expect(att.summarize([broken, { state: 'active', started_at: '', ended_at: '' }])).toEqual({ active_s: 0, idle_s: 0, first: null, last: null })
  })
})

describe('statusFor: half-day leave', () => {
  const half = { start_date: MONDAY, end_date: MONDAY, half_day: true, status: 'approved' }

  it('worked the other half (at least the half-day hours) → present', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [seg('active', '09:00', 240)], [half], []).status).toBe('present')
  })

  it('a late start is the half taken off, never late', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [seg('active', '14:00', 240)], [half], []).status).toBe('present')
  })

  it('too little activity for the other half → half day', () => {
    const r = att.statusFor(MONDAY, SETTINGS, [seg('active', '14:00', 239)], [half], [])
    expect(r.status).toBe('half_day')
    expect(r.active_s).toBe(239 * 60)
  })

  it('no activity at all → half day, never absent or a whole day on leave', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [], [half], []).status).toBe('half_day')
    expect(att.statusFor(MONDAY, SETTINGS, [seg('idle', '09:00', 120)], [half], []).status).toBe('half_day')
  })

  it('no activity is still a half day when the half-day hours are 0', () => {
    expect(att.statusFor(MONDAY, { ...SETTINGS, half_day_min_hours: 0 }, [], [half], []).status).toBe('half_day')
    expect(att.statusFor(MONDAY, { ...SETTINGS, half_day_min_hours: 0 }, [seg('active', '14:00', 1)], [half], []).status).toBe('present')
  })

  it('a full-day leave on the same day wins → on leave', () => {
    const full = { start_date: '2026-10-11', end_date: '2026-10-13', half_day: false, status: 'approved' }
    expect(att.statusFor(MONDAY, SETTINGS, [], [half, full], []).status).toBe('on_leave')
    expect(att.statusFor(MONDAY, SETTINGS, [], [full, half], []).status).toBe('on_leave')
  })

  it('two approved half days on the same day make a whole day → on leave', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [], [half, { ...half }], []).status).toBe('on_leave')
  })

  it('holidays and weekends still come first', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [], [half], [MONDAY]).status).toBe('holiday')
    expect(att.statusFor(SATURDAY, SETTINGS, [], [{ ...half, start_date: SATURDAY, end_date: SATURDAY }], []).status).toBe('weekend')
  })

  it('ignores a half-day leave that is not approved or is on another day', () => {
    expect(att.statusFor(MONDAY, SETTINGS, [], [{ ...half, status: 'pending' }], []).status).toBe('absent')
    expect(att.statusFor(MONDAY, SETTINGS, [], [{ ...half, start_date: '2026-10-13', end_date: '2026-10-13' }], []).status).toBe('absent')
  })

  it('leaveCover', () => {
    const full = { start_date: MONDAY, end_date: MONDAY }
    expect(att.leaveCover(MONDAY, [])).toBe('')
    expect(att.leaveCover(MONDAY, undefined)).toBe('')
    expect(att.leaveCover(MONDAY, [half])).toBe('half')
    expect(att.leaveCover(MONDAY, [full])).toBe('full')
    expect(att.leaveCover(MONDAY, [half, half])).toBe('full')
    expect(att.leaveCover(MONDAY, [{ ...half, status: 'rejected' }])).toBe('')
  })
})

describe('half-day leave through to payroll', () => {
  // The day's record → attendanceCounts → calculate, with unpaid half leave adding its own 0.5.
  const deducted = (segments, paid) => {
    const leave = { start_date: MONDAY, end_date: MONDAY, half_day: true, status: 'approved', paid }
    const rec = att.statusFor(MONDAY, SETTINGS, segments, [leave], [])
    const counts = payroll.attendanceCounts([rec])
    const unpaid = payroll.unpaidLeaveDays([leave], '2026-10', SETTINGS.work_days, [])
    return counts.absent + unpaid + 0.5 * counts.half
  }

  it('paid half day: 0.5 off with no work, nothing off when the other half was worked', () => {
    expect(deducted([], true)).toBe(0.5)
    expect(deducted([seg('active', '14:00', 240)], true)).toBe(0)
  })

  it('unpaid half day: a whole day off with no work, 0.5 when the other half was worked', () => {
    expect(deducted([], false)).toBe(1)
    expect(deducted([seg('active', '14:00', 240)], false)).toBe(0.5)
  })
})

describe('employment window', () => {
  it('counts only days between joining and leaving', () => {
    const u = { active: true, joined_on: '2026-10-05', left_on: '' }
    expect(att.employedOn('2026-10-04', u)).toBe(false)
    expect(att.employedOn('2026-10-05', u)).toBe(true)
    const left = { active: false, joined_on: '2026-01-01', left_on: '2026-10-09' }
    expect(att.employedOn('2026-10-09', left)).toBe(true)
    expect(att.employedOn('2026-10-10', left)).toBe(false)
  })

  it('skips an inactive account with no leaving date', () => {
    expect(att.employedOn('2026-10-05', { active: false, joined_on: '', left_on: '' })).toBe(false)
  })
})

describe('days and ranges', () => {
  it('gives the UTC bounds of a Karachi day', () => {
    expect(att.dayBounds(MONDAY, 300)).toEqual({ start: '2026-10-11 19:00:00.000Z', end: '2026-10-12 19:00:00.000Z' })
  })

  it('knows today in Karachi', () => {
    expect(att.todayKey(300, Date.parse('2026-10-13T19:30:00.000Z'))).toBe('2026-10-14')
  })

  it('runs nightly for yesterday and the 6 days before', () => {
    expect(att.nightlyDays('2026-10-14', 7)).toEqual([
      '2026-10-13', '2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07'
    ])
  })

  it('accepts one date or a range, cut at yesterday', () => {
    expect(att.parseRange({ date: '2026-10-12' }, '2026-10-14').data).toEqual({ from: '2026-10-12', to: '2026-10-12', days: ['2026-10-12'] })
    const month = att.parseRange({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-14').data
    expect(month.to).toBe('2026-10-13')
    expect(month.days.length).toBe(13)
  })

  it.each([
    [{}, 'valid date'],
    [{ date: '2026-02-30' }, 'valid date'],
    [{ from: '2026-10-10', to: '2026-10-09' }, 'on or after'],
    [{ date: '2026-10-14' }, 'up to yesterday'],
    [{ from: '2026-08-01', to: '2026-09-30' }, 'at most 31 days']
  ])('rejects %o', (body, message) => {
    expect(att.parseRange(body, '2026-10-14').error).toContain(message)
  })
})
