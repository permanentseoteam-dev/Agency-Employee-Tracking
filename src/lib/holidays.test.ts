import { describe, expect, it } from 'vitest'
import { daysBetween, fallsOnDayOff, holidaysInYear, validateHoliday, type Holiday } from './holidays'

const saved: Holiday[] = [
  { id: 'h1', date: '2026-08-14', name: 'Independence Day' },
  { id: 'h2', date: '2026-12-25', name: 'Quaid Day' },
  { id: 'h3', date: '2027-02-05', name: 'Kashmir Day' }
]

describe('validateHoliday', () => {
  it('accepts a single day', () => {
    expect(validateHoliday({ from: '2026-03-23', to: '', name: 'Pakistan Day' }, saved)).toEqual({})
  })

  it('accepts a range', () => {
    expect(validateHoliday({ from: '2026-03-20', to: '2026-03-22', name: 'Eid ul Fitr' }, saved)).toEqual({})
  })

  it.each([
    [{ from: '2026-03-23', to: '', name: ' ' }, 'name', 'Enter a name'],
    [{ from: '', to: '', name: 'X' }, 'from', 'Pick a date'],
    [{ from: '2026-02-30', to: '', name: 'X' }, 'from', 'Pick a date'],
    [{ from: '2026-03-22', to: '2026-03-20', name: 'X' }, 'to', 'on or after'],
    [{ from: '2026-03-01', to: '2026-03-20', name: 'X' }, 'to', 'at most 14'],
    [{ from: '2026-08-14', to: '', name: 'X' }, 'from', 'Already a holiday: 2026-08-14 (Independence Day)'],
    [{ from: '2026-08-13', to: '2026-08-15', name: 'X' }, 'to', 'Already a holiday']
  ])('rejects %o', (input, field, message) => {
    expect(validateHoliday(input, saved)[field as 'from']).toContain(message)
  })

  it('lets an edit keep its own date', () => {
    expect(validateHoliday({ from: '2026-08-14', to: '', name: 'Azadi Day' }, saved, 'h1')).toEqual({})
  })
})

describe('helpers', () => {
  it('lists the days of a range', () => {
    expect(daysBetween('2026-03-30', '2026-04-01')).toEqual(['2026-03-30', '2026-03-31', '2026-04-01'])
  })

  it('filters and sorts one year', () => {
    expect(holidaysInYear([...saved].reverse(), 2026).map((h) => h.id)).toEqual(['h1', 'h2'])
  })

  it('knows when a holiday falls on a day off', () => {
    expect(fallsOnDayOff('2026-08-15', [1, 2, 3, 4, 5])).toBe(true) // Saturday
    expect(fallsOnDayOff('2026-08-14', [1, 2, 3, 4, 5])).toBe(false) // Friday
  })
})
