// Pure helpers for the calendar month view (plan §4.6). Days are "YYYY-MM-DD"
// keys in the org timezone; event times are UTC instants shown in that timezone.
import { addDays, formatTime, isoWeekday, toDateKey, zonedTimeToUtc, DEFAULT_TZ } from './dates'

export interface CalendarEvent {
  id: string
  title: string
  starts_at: string
  ends_at: string
  description: string
  /** Empty for a company-wide event. */
  team: string
}

export interface LeaveEntry {
  id: string
  user: string
  start_date: string
  end_date: string
  half_day: boolean
  expand?: { user?: { id: string; full_name: string; team: string }; leave_type?: { name: string } }
}

export interface DayInfo {
  holiday: string | null
  /** Not a working day (weekend). */
  off: boolean
  leaves: LeaveEntry[]
  events: CalendarEvent[]
}

const instant = (value: string) => Date.parse(value.replace(' ', 'T'))

/** Weeks (Monday to Sunday) covering a "YYYY-MM" month, filled with days of the months around it. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`
  let day = addDays(first, 1 - isoWeekday(first))
  const weeks: string[][] = []
  while (weeks.length === 0 || day.startsWith(month)) {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(day)
      day = addDays(day, 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** Local days an event touches. One that ends exactly at midnight doesn't touch the next day. */
export function eventDays(e: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, tz: string = DEFAULT_TZ): string[] {
  const start = instant(e.starts_at)
  const end = instant(e.ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return []
  const last = toDateKey(Math.max(start, end - 1), tz)
  const days: string[] = []
  for (let d = toDateKey(start, tz); d <= last && days.length < 366; d = addDays(d, 1)) days.push(d)
  return days
}

/** The working days a leave covers (weekends and holidays inside it are not "off"). */
export function leaveDays(l: Pick<LeaveEntry, 'start_date' | 'end_date'>, workDays: number[], holidays: Set<string>): string[] {
  const days: string[] = []
  for (let d = l.start_date; d <= l.end_date && days.length < 366; d = addDays(d, 1)) {
    if (workDays.includes(isoWeekday(d)) && !holidays.has(d)) days.push(d)
  }
  return days
}

/** Everything to show on each day of the grid. */
export function buildDays(
  days: string[],
  data: { holidays: { date: string; name: string }[]; leaves: LeaveEntry[]; events: CalendarEvent[]; workDays: number[]; tz?: string }
): Map<string, DayInfo> {
  const map = new Map<string, DayInfo>()
  const holidayName = new Map(data.holidays.map((h) => [h.date, h.name]))
  for (const d of days) map.set(d, { holiday: holidayName.get(d) ?? null, off: !data.workDays.includes(isoWeekday(d)), leaves: [], events: [] })
  const holidaySet = new Set(holidayName.keys())
  for (const l of data.leaves) for (const d of leaveDays(l, data.workDays, holidaySet)) map.get(d)?.leaves.push(l)
  const byStart = [...data.events].sort((a, b) => instant(a.starts_at) - instant(b.starts_at))
  for (const e of byStart) for (const d of eventDays(e, data.tz)) map.get(d)?.events.push(e)
  return map
}

/** Company-wide events and those of the given teams (admins pass all = true). */
export function visibleEvent(e: Pick<CalendarEvent, 'team'>, teamIds: Set<string>, all: boolean): boolean {
  return all || !e.team || teamIds.has(e.team)
}

function isMidnight(value: string, tz: string): boolean {
  return formatTime(instant(value), tz) === '00:00'
}

/** Starts and ends at local midnight. */
export function isAllDay(e: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, tz: string = DEFAULT_TZ): boolean {
  return isMidnight(e.starts_at, tz) && isMidnight(e.ends_at, tz)
}

/** "All day", "10:00–11:00", "from 16:00" (first of several days) or "until 12:00" (last day). */
export function eventTimeLabel(e: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, day: string, tz: string = DEFAULT_TZ): string {
  if (isAllDay(e, tz)) return 'All day'
  const days = eventDays(e, tz)
  const start = formatTime(instant(e.starts_at), tz)
  const end = formatTime(instant(e.ends_at), tz)
  if (days.length <= 1) return `${start}–${end}`
  if (day === days[0]) return `from ${start}`
  if (day === days[days.length - 1]) return `until ${end}`
  return 'All day'
}

export interface EventInput {
  title: string
  allDay: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  team: string
  description: string
}

export type EventErrors = Partial<Record<keyof EventInput, string>>

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Form values → UTC instants. All-day events run from midnight of the first day to midnight after the last. */
export function eventTimes(input: EventInput, tz: string = DEFAULT_TZ): { starts_at: string; ends_at: string } {
  const start = zonedTimeToUtc(input.startDate, input.allDay ? '00:00' : input.startTime, tz)
  const end = input.allDay ? zonedTimeToUtc(addDays(input.endDate, 1), '00:00', tz) : zonedTimeToUtc(input.endDate, input.endTime, tz)
  return { starts_at: start.toISOString(), ends_at: end.toISOString() }
}

export function validateEvent(input: EventInput, tz: string = DEFAULT_TZ): EventErrors {
  const errors: EventErrors = {}
  const title = input.title.trim()
  if (!title) errors.title = 'Give the event a title.'
  else if (title.length > 200) errors.title = 'Keep the title under 200 characters.'
  if (!DATE.test(input.startDate)) errors.startDate = 'Pick a start date.'
  if (!DATE.test(input.endDate)) errors.endDate = 'Pick an end date.'
  if (!input.allDay) {
    if (!TIME.test(input.startTime)) errors.startTime = 'Pick a start time.'
    if (!TIME.test(input.endTime)) errors.endTime = 'Pick an end time.'
  }
  if (Object.keys(errors).length === 0) {
    const t = eventTimes(input, tz)
    if (Date.parse(t.ends_at) <= Date.parse(t.starts_at)) errors[input.allDay ? 'endDate' : 'endTime'] = 'The event must end after it starts.'
  }
  if (input.description.length > 2000) errors.description = 'Keep the description under 2,000 characters.'
  return errors
}

/** A saved event back into form values. */
export function eventToInput(e: CalendarEvent, tz: string = DEFAULT_TZ): EventInput {
  const allDay = isAllDay(e, tz)
  const end = instant(e.ends_at)
  return {
    title: e.title,
    allDay,
    startDate: toDateKey(instant(e.starts_at), tz),
    startTime: formatTime(instant(e.starts_at), tz),
    endDate: toDateKey(allDay ? end - 1 : end, tz),
    endTime: formatTime(end, tz),
    team: e.team,
    description: e.description
  }
}
