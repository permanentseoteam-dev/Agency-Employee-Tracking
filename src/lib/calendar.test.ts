import { describe, expect, it } from 'vitest'
import {
  buildDays,
  eventDays,
  eventTimeLabel,
  eventTimes,
  eventToInput,
  isAllDay,
  leaveDays,
  monthGrid,
  validateEvent,
  visibleEvent,
  type CalendarEvent,
  type EventInput,
  type LeaveEntry
} from './calendar'

const MON_FRI = [1, 2, 3, 4, 5]
const ev = (starts_at: string, ends_at: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: 'Standup',
  description: '',
  team: '',
  starts_at,
  ends_at,
  ...extra
})

describe('monthGrid', () => {
  it('covers October 2026 in Monday–Sunday weeks', () => {
    const weeks = monthGrid('2026-10')
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toBe('2026-09-28') // Monday before Thu 1 Oct
    expect(weeks[4][6]).toBe('2026-11-01')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('uses six weeks when the month needs them', () => {
    expect(monthGrid('2026-08')).toHaveLength(6) // 1 Aug 2026 is a Saturday
  })
})

describe('events', () => {
  it('stays on its day in Karachi time', () => {
    // 10:00–11:00 PKT on 14 Oct
    expect(eventDays(ev('2026-10-14 05:00:00.000Z', '2026-10-14 06:00:00.000Z'))).toEqual(['2026-10-14'])
  })

  it('spans days, but not into the day it ends at midnight', () => {
    const allDay = ev('2026-10-19 19:00:00.000Z', '2026-10-21 19:00:00.000Z') // 20 Oct 00:00 – 22 Oct 00:00 PKT
    expect(eventDays(allDay)).toEqual(['2026-10-20', '2026-10-21'])
    expect(isAllDay(allDay)).toBe(true)
    expect(eventTimeLabel(allDay, '2026-10-20')).toBe('All day')
  })

  it('labels times', () => {
    const multi = ev('2026-10-14 11:00:00.000Z', '2026-10-15 07:00:00.000Z') // 16:00 on 14th → 12:00 on 15th
    expect(eventTimeLabel(multi, '2026-10-14')).toBe('from 16:00')
    expect(eventTimeLabel(multi, '2026-10-15')).toBe('until 12:00')
    expect(eventTimeLabel(ev('2026-10-14 05:00:00.000Z', '2026-10-14 06:30:00.000Z'), '2026-10-14')).toBe('10:00–11:30')
  })

  it('shows company-wide and own-team events', () => {
    const mine = new Set(['t1'])
    expect(visibleEvent({ team: '' }, mine, false)).toBe(true)
    expect(visibleEvent({ team: 't1' }, mine, false)).toBe(true)
    expect(visibleEvent({ team: 't2' }, mine, false)).toBe(false)
    expect(visibleEvent({ team: 't2' }, mine, true)).toBe(true)
  })
})

describe('leave', () => {
  it('marks only working days as off', () => {
    // Thu 8 – Mon 12 Oct with a holiday on Fri 9 → Thu and Mon
    expect(leaveDays({ start_date: '2026-10-08', end_date: '2026-10-12' }, MON_FRI, new Set(['2026-10-09']))).toEqual(['2026-10-08', '2026-10-12'])
  })
})

describe('buildDays', () => {
  it('puts holidays, leave and events on their days', () => {
    const leave: LeaveEntry = { id: 'l1', user: 'u1', start_date: '2026-10-12', end_date: '2026-10-13', half_day: false }
    const days = buildDays(['2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13', '2026-10-14'], {
      holidays: [{ date: '2026-10-09', name: 'Test Day' }],
      leaves: [leave],
      events: [ev('2026-10-14 05:00:00.000Z', '2026-10-14 06:00:00.000Z')],
      workDays: MON_FRI
    })
    expect(days.get('2026-10-09')).toMatchObject({ holiday: 'Test Day', off: false })
    expect(days.get('2026-10-10')).toMatchObject({ holiday: null, off: true })
    expect(days.get('2026-10-12')!.leaves).toEqual([leave])
    expect(days.get('2026-10-13')!.leaves).toEqual([leave])
    expect(days.get('2026-10-14')!.events.map((e) => e.title)).toEqual(['Standup'])
  })
})

describe('event form', () => {
  const input: EventInput = {
    title: 'Town hall',
    allDay: false,
    startDate: '2026-10-16',
    startTime: '15:00',
    endDate: '2026-10-16',
    endTime: '16:00',
    team: '',
    description: ''
  }

  it('turns Karachi times into UTC', () => {
    expect(eventTimes(input)).toEqual({ starts_at: '2026-10-16T10:00:00.000Z', ends_at: '2026-10-16T11:00:00.000Z' })
    expect(eventTimes({ ...input, allDay: true, endDate: '2026-10-17' })).toEqual({
      starts_at: '2026-10-15T19:00:00.000Z',
      ends_at: '2026-10-17T19:00:00.000Z'
    })
  })

  it('validates', () => {
    expect(validateEvent(input)).toEqual({})
    expect(validateEvent({ ...input, title: ' ' }).title).toContain('title')
    expect(validateEvent({ ...input, endTime: '14:00' }).endTime).toContain('end after it starts')
    expect(validateEvent({ ...input, allDay: true, endDate: '2026-10-15' }).endDate).toContain('end after it starts')
    expect(validateEvent({ ...input, startTime: '' }).startTime).toContain('start time')
  })

  it('reads a saved event back into the form', () => {
    const allDay = ev('2026-10-15T19:00:00.000Z', '2026-10-17T19:00:00.000Z', { title: 'Retreat', team: 't1' })
    expect(eventToInput(allDay)).toMatchObject({ allDay: true, startDate: '2026-10-16', endDate: '2026-10-17', team: 't1' })
    expect(eventToInput(ev('2026-10-16T10:00:00.000Z', '2026-10-16T11:00:00.000Z'))).toMatchObject({
      allDay: false,
      startDate: '2026-10-16',
      startTime: '15:00',
      endTime: '16:00'
    })
  })
})
