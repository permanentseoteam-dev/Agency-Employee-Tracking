import { describe, expect, it } from 'vitest'
import { shiftHours, validateRules, type RulesInput } from './rules'

const ok: RulesInput = {
  shift_start: '09:00',
  shift_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  grace_minutes: 15,
  full_day_min_hours: 8,
  half_day_min_hours: 4,
  idle_threshold_minutes: 5,
  late_penalty_pkr: 500,
  timezone: 'Asia/Karachi'
}

describe('validateRules', () => {
  it('accepts the defaults', () => {
    expect(validateRules(ok)).toEqual({})
  })

  it.each([
    [{ shift_start: '9am' }, 'shift_start'],
    [{ shift_end: '08:00' }, 'shift_end'],
    [{ work_days: [] }, 'work_days'],
    [{ grace_minutes: -1 }, 'grace_minutes'],
    [{ grace_minutes: 2.5 }, 'grace_minutes'],
    [{ half_day_min_hours: 8 }, 'half_day_min_hours'],
    [{ full_day_min_hours: 10 }, 'full_day_min_hours'],
    [{ idle_threshold_minutes: 0 }, 'idle_threshold_minutes'],
    [{ idle_threshold_minutes: 90 }, 'idle_threshold_minutes'],
    [{ late_penalty_pkr: -5 }, 'late_penalty_pkr']
  ])('flags %o', (patch, field) => {
    expect(Object.keys(validateRules({ ...ok, ...patch } as RulesInput))).toContain(field)
  })

  it('measures the shift length', () => {
    expect(shiftHours('09:00', '18:00')).toBe(9)
    expect(shiftHours('09:30', '13:00')).toBe(3.5)
  })
})
