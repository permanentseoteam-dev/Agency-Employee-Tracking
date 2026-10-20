import { describe, expect, it } from 'vitest'
import { shiftHours, validateRules, type RulesInput } from './rules'

const ok: RulesInput = {
  shift_start: '09:00',
  shift_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  grace_minutes: 15,
  full_day_min_hours: 8,
  half_day_min_hours: 4,
  required_daily_minutes: 360,
  star_block_minutes: 30,
  star_value_mode: 'half_hour_pay',
  star_value_pkr: 0,
  idle_threshold_minutes: 5,
  monthly_full_leaves: 0,
  monthly_half_leaves: 0,
  timezone: 'Asia/Karachi'
}

describe('validateRules', () => {
  it('accepts the defaults', () => {
    expect(validateRules(ok)).toEqual({})
  })

  it('accepts monthly leave limits (0 = no limit)', () => {
    expect(validateRules({ ...ok, monthly_full_leaves: 2, monthly_half_leaves: 3 })).toEqual({})
  })

  it.each([
    [{ shift_start: '9am' }, 'shift_start'],
    [{ shift_end: '08:00' }, 'shift_end'],
    [{ work_days: [] }, 'work_days'],
    [{ grace_minutes: -1 }, 'grace_minutes'],
    [{ grace_minutes: 2.5 }, 'grace_minutes'],
    [{ required_daily_minutes: 0 }, 'required_daily_minutes'],
    [{ required_daily_minutes: 600 }, 'required_daily_minutes'],
    [{ required_daily_minutes: 360.5 }, 'required_daily_minutes'],
    [{ star_block_minutes: 0 }, 'star_block_minutes'],
    [{ star_block_minutes: 300 }, 'star_block_minutes'],
    [{ star_value_mode: 'per_star' }, 'star_value_mode'],
    [{ star_value_mode: 'fixed_pkr', star_value_pkr: -1 }, 'star_value_pkr'],
    [{ idle_threshold_minutes: 0 }, 'idle_threshold_minutes'],
    [{ idle_threshold_minutes: 90 }, 'idle_threshold_minutes'],
    [{ monthly_full_leaves: -1 }, 'monthly_full_leaves'],
    [{ monthly_full_leaves: 1.5 }, 'monthly_full_leaves'],
    [{ monthly_half_leaves: 40 }, 'monthly_half_leaves']
  ])('flags %o', (patch, field) => {
    expect(Object.keys(validateRules({ ...ok, ...patch } as RulesInput))).toContain(field)
  })

  it('ignores the amount unless a star has a fixed price', () => {
    expect(validateRules({ ...ok, star_value_pkr: Number.NaN })).toEqual({})
    expect(validateRules({ ...ok, star_value_mode: 'fixed_pkr', star_value_pkr: 250 })).toEqual({})
  })

  it('measures the shift length', () => {
    expect(shiftHours('09:00', '18:00')).toBe(9)
    expect(shiftHours('09:30', '13:00')).toBe(3.5)
  })
})
