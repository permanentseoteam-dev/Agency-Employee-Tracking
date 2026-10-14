// Pure helpers for the holiday manager (plan §4.6). Holidays are "YYYY-MM-DD"
// day keys in the org timezone and feed attendance and payroll.
import { addDays, isoWeekday } from './dates'

export interface Holiday {
  id: string
  date: string
  name: string
}

export interface HolidayInput {
  from: string
  /** Optional last day, for holidays that span several days (e.g. Eid). */
  to: string
  name: string
}

/** The longest range added in one go. */
export const MAX_RANGE_DAYS = 14

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export function isDateKey(value: string): boolean {
  if (!DATE_KEY.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Every day from–to (inclusive). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d)
  return out
}

export type HolidayErrors = Partial<Record<keyof HolidayInput, string>>

/** Checks the form. `existing` is every saved holiday; `editingId` is skipped when editing. */
export function validateHoliday(input: HolidayInput, existing: Holiday[], editingId?: string): HolidayErrors {
  const errors: HolidayErrors = {}
  const name = input.name.trim()
  if (!name) errors.name = 'Enter a name, e.g. Independence Day.'
  else if (name.length > 100) errors.name = 'Keep the name under 100 characters.'

  if (!isDateKey(input.from)) errors.from = 'Pick a date.'
  const to = input.to || input.from
  if (!errors.from && input.to) {
    if (!isDateKey(input.to)) errors.to = 'Pick a valid end date.'
    else if (to < input.from) errors.to = 'The last day must be on or after the first day.'
    else if (daysBetween(input.from, to).length > MAX_RANGE_DAYS) errors.to = `Add at most ${MAX_RANGE_DAYS} days at a time.`
  }
  if (!errors.from && !errors.to) {
    const taken = existing.filter((h) => h.id !== editingId && h.date >= input.from && h.date <= to)
    if (taken.length) {
      const which = taken.map((h) => `${h.date} (${h.name})`).join(', ')
      errors[input.to && input.to !== input.from ? 'to' : 'from'] = `Already a holiday: ${which}.`
    }
  }
  return errors
}

/** Holidays in a year, by date. */
export function holidaysInYear(all: Holiday[], year: number): Holiday[] {
  const prefix = `${year}-`
  return all.filter((h) => h.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date))
}

/** True when the day is not a working day anyway (so the holiday changes nothing). */
export function fallsOnDayOff(date: string, workDays: number[]): boolean {
  return !workDays.includes(isoWeekday(date))
}
