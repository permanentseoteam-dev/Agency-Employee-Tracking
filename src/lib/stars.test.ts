import { describe, expect, it } from 'vitest'
import { starLines, starsByUser, starsText, starTotal, type StarRecord, type StarRule } from './stars'

const late: StarRule = { id: 'r-late', name: 'Late arrival', stars: 1, auto: 'late', description: '', pkr_per_star: 0 }
const absent: StarRule = { id: 'r-absent', name: 'Absent without leave', stars: 3, auto: 'absent', description: '', pkr_per_star: 0 }
const short: StarRule = { id: 'r-short', name: 'Short hours', stars: 0, auto: 'half_day', description: '', pkr_per_star: 0 }
const phone: StarRule = { id: 'r-phone', name: 'Phone in meetings', stars: 2, auto: '', description: '', pkr_per_star: 0 }
const RULES = [late, absent, short, phone]

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
  { user: 'u1', date: '2026-10-01', status: 'late' as const },
  { user: 'u1', date: '2026-10-02', status: 'present' as const },
  { user: 'u1', date: '2026-10-06', status: 'absent' as const },
  { user: 'u1', date: '2026-10-07', status: 'half_day' as const },
  { user: 'u2', date: '2026-10-01', status: 'late' as const },
  { user: 'u2', date: '2026-10-02', status: 'on_leave' as const }
]

describe('stars', () => {
  it('gives automatic stars for Late, Absent and Half day days, with the rule’s current amount', () => {
    const lines = starLines(attendance, RULES, [])
    expect(lines.filter((l) => l.user === 'u1').map((l) => [l.date, l.rule.name, l.stars])).toEqual([
      ['2026-10-07', 'Short hours', 0],
      ['2026-10-06', 'Absent without leave', 3],
      ['2026-10-01', 'Late arrival', 1]
    ])
    expect(starsByUser(lines)).toEqual({ u1: 4, u2: 1 })
  })

  it('adds stars given by hand and leaves out excused days', () => {
    const lines = starLines(attendance, RULES, [
      record({ id: 'hand', rule: 'r-phone', date: '2026-10-05' }),
      record({ id: 'excuse', rule: 'r-late', date: '2026-10-01', excused: true })
    ])
    const mine = lines.filter((l) => l.user === 'u1')
    expect(mine.find((l) => l.record?.id === 'hand')).toMatchObject({ automatic: false, stars: 2 })
    expect(mine.find((l) => l.date === '2026-10-01')).toMatchObject({ automatic: true, excused: true })
    expect(starTotal(mine)).toBe(2 + 3 + 0)
    expect(starsByUser(lines).u2).toBe(1) // u1's excuse doesn't touch u2's late day
  })

  it('ignores records for a rule that was deleted', () => {
    expect(starLines([], RULES, [record({ rule: 'gone' })])).toEqual([])
  })

  it('says 1 star and 2 stars', () => {
    expect(starsText(1)).toBe('1 star')
    expect(starsText(0)).toBe('0 stars')
  })
})
