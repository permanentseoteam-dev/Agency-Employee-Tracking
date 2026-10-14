import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayRangeUtc,
  formatDate,
  formatDayKey,
  formatTime,
  isoWeekday,
  toDateKey,
  tzOffsetMinutes,
  zonedTimeToUtc
} from './dates'

describe('dates (Asia/Karachi)', () => {
  it('has a +5 h offset', () => {
    expect(tzOffsetMinutes('2026-10-14T00:00:00Z')).toBe(300)
  })

  it('puts 20:00 UTC on the next Karachi day', () => {
    expect(toDateKey('2026-10-14T18:59:59Z')).toBe('2026-10-14')
    expect(toDateKey('2026-10-14T19:00:00Z')).toBe('2026-10-15')
  })

  it('converts shift start 09:00 PKT to 04:00 UTC', () => {
    expect(zonedTimeToUtc('2026-10-14', '09:00').toISOString()).toBe('2026-10-14T04:00:00.000Z')
  })

  it('returns the UTC range of a Karachi day', () => {
    const { start, end } = dayRangeUtc('2026-10-14')
    expect(start.toISOString()).toBe('2026-10-13T19:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-14T19:00:00.000Z')
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('gives ISO weekdays', () => {
    expect(isoWeekday('2026-10-12')).toBe(1) // Monday
    expect(isoWeekday('2026-10-18')).toBe(7) // Sunday
  })

  it('formats for display', () => {
    expect(formatDate('2026-10-14T04:00:00Z')).toBe('14 Oct 2026')
    expect(formatTime('2026-10-14T04:05:00Z')).toBe('09:05')
  })

  it('rejects invalid input', () => {
    expect(() => toDateKey('not a date')).toThrow(RangeError)
  })
})

describe('formatDayKey', () => {
  it('shows the weekday and date of a day key', () => {
    expect(formatDayKey('2026-08-14')).toBe('Fri 14 Aug 2026')
  })
})
