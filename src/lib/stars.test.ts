import { describe, expect, it } from 'vitest'
import { lateToday, recordsByDay, starLines, starsByUser, starsText, starTotal, type StarRecord, type StarRule } from './stars'

const late: StarRule = { id: 'r-late', name: 'Late arrival', stars: 0, auto: 'late', description: '' }
const short: StarRule = { id: 'r-short', name: 'Short of the daily target', stars: 0, auto: 'short', description: '' }
const phone: StarRule = { id: 'r-phone', name: 'Phone in meetings', stars: 2, auto: '', description: '' }
const RULES = [late, short, phone]

const record = (patch: Partial<StarRecord>): StarRecord => ({
  id: 'x',
  user: 'u1',
  rule: 'r-phone',
  date: '2026-10-05',
  note: '',
  given_by: 'admin',
  excused: false,
  ...patch
})

const attendance = [
  { user: 'u1', date: '2026-10-01', status: 'late' as const, late_stars: 1, shortfall_stars: 0 },
  { user: 'u1', date: '2026-10-02', status: 'present' as const, late_stars: 0, shortfall_stars: 2 },
  { user: 'u1', date: '2026-10-06', status: 'absent' as const, late_stars: 0, shortfall_stars: 0 },
  { user: 'u1', date: '2026-10-07', status: 'late' as const, late_stars: 3, shortfall_stars: 1 },
  { user: 'u2', date: '2026-10-01', status: 'late' as const, late_stars: 2, shortfall_stars: 0 },
  { user: 'u2', date: '2026-10-02', status: 'on_leave' as const }
]

describe('stars', () => {
  it('gives the late and short stars each day counted, as their own lines', () => {
    const lines = starLines(attendance, RULES, [])
    expect(lines.filter((l) => l.user === 'u1').map((l) => [l.date, l.rule.name, l.stars])).toEqual([
      ['2026-10-07', 'Late arrival', 3],
      ['2026-10-07', 'Short of the daily target', 1],
      ['2026-10-02', 'Short of the daily target', 2],
      ['2026-10-01', 'Late arrival', 1]
    ])
    expect(starsByUser(lines)).toEqual({ u1: 7, u2: 2 })
  })

  it('adds stars given by hand and leaves out excused days', () => {
    const lines = starLines(attendance, RULES, [
      record({ id: 'hand', rule: 'r-phone', date: '2026-10-05' }),
      record({ id: 'excuse', rule: 'r-late', date: '2026-10-01', excused: true })
    ])
    const mine = lines.filter((l) => l.user === 'u1')
    expect(mine.find((l) => l.record?.id === 'hand')).toMatchObject({ automatic: false, stars: 2 })
    expect(mine.find((l) => l.date === '2026-10-01')).toMatchObject({ automatic: true, excused: true })
    expect(starTotal(mine)).toBe(2 + 2 + 3 + 1)
    expect(starsByUser(lines).u2).toBe(2) // u1's excuse doesn't touch u2's late day
  })

  it('ignores records for a rule that was deleted, and days counted before stars were stored', () => {
    expect(starLines([], RULES, [record({ rule: 'gone' })])).toEqual([])
    expect(starLines([{ user: 'u1', date: '2026-09-01', status: 'late' }], RULES, [])).toEqual([])
  })

  it('says 1 star and 2 stars', () => {
    expect(starsText(1)).toBe('1 star')
    expect(starsText(0)).toBe('0 stars')
  })
})

describe('lateToday', () => {
  const nine = Date.parse('2026-10-12T04:00:00Z') // 09:00 in Karachi
  const at = (min: number) => nine + min * 60000
  it('1–30 min after grace = 1 star, 31–60 = 2', () => {
    expect(lateToday(at(15), nine, 15, 30)).toEqual({ minutes: 0, stars: 0 })
    expect(lateToday(at(16), nine, 15, 30)).toEqual({ minutes: 1, stars: 1 })
    expect(lateToday(at(45), nine, 15, 30)).toEqual({ minutes: 30, stars: 1 })
    expect(lateToday(at(46), nine, 15, 30)).toEqual({ minutes: 31, stars: 2 })
    expect(lateToday(null, nine, 15, 30)).toEqual({ minutes: 0, stars: 0 })
  })
})

describe('recordsByDay (stars for pay.calculateMonth)', () => {
  it('adds hand stars per day and marks excused late or short stars', () => {
    const out = recordsByDay(RULES, [
      record({ rule: 'r-phone', date: '2026-10-05' }),
      record({ rule: 'r-phone', date: '2026-10-05' }),
      record({ rule: 'r-late', date: '2026-10-06', excused: true }),
      record({ rule: 'r-short', date: '2026-10-06', excused: true }),
      record({ rule: 'gone', date: '2026-10-07' })
    ])
    expect(out).toEqual({
      '2026-10-05': { hand: 4, late: false, short: false },
      '2026-10-06': { hand: 0, late: true, short: true }
    })
  })
})
