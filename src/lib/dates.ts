// The server stores UTC. Everything shown to people, and every "which day is it"
// decision, goes through these helpers in the org timezone.

export const DEFAULT_TZ = 'Asia/Karachi'

type DateInput = Date | string | number

function toDate(value: DateInput): Date {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${String(value)}`)
  return d
}

function zonedParts(value: DateInput, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(toDate(value))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second')
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Minutes the timezone is ahead of UTC at that instant (Asia/Karachi → 300). */
export function tzOffsetMinutes(value: DateInput, tz: string = DEFAULT_TZ): number {
  const d = toDate(value)
  const p = zonedParts(d, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000)
}

/** The calendar day in the timezone, as "YYYY-MM-DD". */
export function toDateKey(value: DateInput, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(value, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** UTC instant for a wall-clock time ("HH:mm") on a day ("YYYY-MM-DD") in the timezone. */
export function zonedTimeToUtc(dateKey: string, time: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const offset = tzOffsetMinutes(guess, tz)
  const result = new Date(guess - offset * 60000)
  // Re-check once in case the guess fell on the other side of an offset change.
  const corrected = tzOffsetMinutes(result, tz)
  return corrected === offset ? result : new Date(guess - corrected * 60000)
}

/** UTC start and end (exclusive) of a day in the timezone, for record queries. */
export function dayRangeUtc(dateKey: string, tz: string = DEFAULT_TZ): { start: Date; end: Date } {
  const start = zonedTimeToUtc(dateKey, '00:00', tz)
  const end = zonedTimeToUtc(addDays(dateKey, 1), '00:00', tz)
  return { start, end }
}

/** Adds whole days to a "YYYY-MM-DD" key. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** ISO weekday of a "YYYY-MM-DD" key: 1 = Monday … 7 = Sunday (matches org_settings.work_days). */
export function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

/** "14 Oct 2026" in the timezone. */
export function formatDate(value: DateInput, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(toDate(value))
}

/** "09:05" (24-hour) in the timezone. */
export function formatTime(value: DateInput, tz: string = DEFAULT_TZ): string {
  const p = zonedParts(value, tz)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** "Fri 14 Aug 2026" for a "YYYY-MM-DD" day key (no timezone shift: it is already a local day). */
export function formatDayKey(dateKey: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dateKey}T12:00:00Z`))
    .replace(',', '')
}
