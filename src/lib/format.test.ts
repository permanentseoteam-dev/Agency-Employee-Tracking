import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it.each([
    [19380, '5h 23m'],
    [0, '0h 0m'],
    [59, '0h 0m'],
    [60, '0h 1m'],
    [3600, '1h 0m'],
    [36000 + 59 * 60 + 59, '10h 59m'],
    [-30, '0h 0m'],
    [Number.NaN, '0h 0m']
  ])('%s s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})
