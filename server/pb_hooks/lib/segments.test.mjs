import { describe, expect, it } from 'vitest'
import segments from './segments.js'

const NOW = Date.parse('2026-10-14T10:00:00.000Z')
const at = (offsetMinutes) => new Date(NOW + offsetMinutes * 60000).toISOString()

describe('parseInstant', () => {
  it('reads PocketBase and ISO dates', () => {
    expect(segments.parseInstant('2026-10-14 10:00:00.000Z')).toBe(NOW)
    expect(segments.parseInstant('2026-10-14T10:00:00.000Z')).toBe(NOW)
  })

  it('returns NaN for missing or bad values', () => {
    expect(segments.parseInstant('')).toBeNaN()
    expect(segments.parseInstant(undefined)).toBeNaN()
    expect(segments.parseInstant('yesterday')).toBeNaN()
  })
})

describe('validateSegment', () => {
  it('accepts a normal 5-minute segment', () => {
    expect(segments.validateSegment(at(-6), at(-1), NOW)).toBeNull()
  })

  it('accepts a segment ending up to 2 minutes ahead (small clock drift)', () => {
    expect(segments.validateSegment(at(-3), at(2), NOW)).toBeNull()
  })

  it('accepts exactly 6 minutes', () => {
    expect(segments.validateSegment(at(-7), at(-1), NOW)).toBeNull()
  })

  it.each([
    ['missing times', '', at(0), 'valid start and end'],
    ['end equal to start', at(-1), at(-1), 'end after it starts'],
    ['end before start', at(-1), at(-2), 'end after it starts'],
    ['longer than 6 minutes', at(-8), at(-1.9), 'longer than 6 minutes'],
    ['clock set 1 hour ahead', at(57), at(60), 'in the future'],
    ['ends just over 2 minutes ahead', at(-2), at(2.1), 'in the future'],
    ['older than 30 days', at(-30 * 24 * 60 - 5), at(-30 * 24 * 60 - 1), 'more than 30 days old']
  ])('rejects %s', (_label, start, end, message) => {
    expect(segments.validateSegment(start, end, NOW)).toContain(message)
  })
})
