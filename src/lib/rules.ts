import type { OrgSettings } from './db'

export type RulesInput = Omit<OrgSettings, 'id' | 'updated'>

export const WEEKDAYS: { iso: number; short: string }[] = [
  { iso: 1, short: 'Mon' },
  { iso: 2, short: 'Tue' },
  { iso: 3, short: 'Wed' },
  { iso: 4, short: 'Thu' },
  { iso: 5, short: 'Fri' },
  { iso: 6, short: 'Sat' },
  { iso: 7, short: 'Sun' }
]

const TIME_HM = /^([01]\d|2[0-3]):[0-5]\d$/

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Shift length in hours, e.g. 09:00–18:00 → 9. */
export function shiftHours(start: string, end: string): number {
  return (minutesOf(end) - minutesOf(start)) / 60
}

export type RulesErrors = Partial<Record<keyof RulesInput, string>>

/** Checks the Rules form. Returns an empty object when everything is valid. */
export function validateRules(r: RulesInput): RulesErrors {
  const errors: RulesErrors = {}
  if (!TIME_HM.test(r.shift_start)) errors.shift_start = 'Use a time like 09:00.'
  if (!TIME_HM.test(r.shift_end)) errors.shift_end = 'Use a time like 18:00.'
  if (!errors.shift_start && !errors.shift_end && minutesOf(r.shift_end) <= minutesOf(r.shift_start)) {
    errors.shift_end = 'The shift must end after it starts (overnight shifts are not supported).'
  }
  if (!Array.isArray(r.work_days) || r.work_days.length === 0) errors.work_days = 'Pick at least one working day.'
  else if (r.work_days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) errors.work_days = 'Invalid weekday.'

  if (!Number.isInteger(r.grace_minutes) || r.grace_minutes < 0 || r.grace_minutes > 240) {
    errors.grace_minutes = 'Enter whole minutes between 0 and 240.'
  }
  if (!Number.isInteger(r.required_daily_minutes) || r.required_daily_minutes < 1) {
    errors.required_daily_minutes = 'Enter the hours, e.g. 6.'
  } else if (!errors.shift_start && !errors.shift_end && r.required_daily_minutes > minutesOf(r.shift_end) - minutesOf(r.shift_start)) {
    errors.required_daily_minutes = 'The daily target can’t be longer than the shift.'
  }
  if (!Number.isInteger(r.star_block_minutes) || r.star_block_minutes < 1 || r.star_block_minutes > 240) {
    errors.star_block_minutes = 'Enter whole minutes between 1 and 240.'
  }
  if (r.star_value_mode !== 'half_hour_pay' && r.star_value_mode !== 'fixed_pkr') {
    errors.star_value_mode = 'Pick what a star costs.'
  } else if (r.star_value_mode === 'fixed_pkr' && !(r.star_value_pkr >= 0 && r.star_value_pkr <= 1_000_000)) {
    errors.star_value_pkr = 'Enter an amount between 0 and 1,000,000.'
  }
  if (!Number.isInteger(r.idle_threshold_minutes) || r.idle_threshold_minutes < 1 || r.idle_threshold_minutes > 60) {
    errors.idle_threshold_minutes = 'Enter whole minutes between 1 and 60.'
  }
  if (!Number.isInteger(r.monthly_full_leaves) || r.monthly_full_leaves < 0 || r.monthly_full_leaves > 31) {
    errors.monthly_full_leaves = 'Enter whole days between 0 and 31 (0 = no limit).'
  }
  if (!Number.isInteger(r.monthly_half_leaves) || r.monthly_half_leaves < 0 || r.monthly_half_leaves > 31) {
    errors.monthly_half_leaves = 'Enter a whole number between 0 and 31 (0 = no limit).'
  }
  return errors
}
