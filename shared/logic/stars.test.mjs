import { describe, expect, it } from 'vitest'
import s from './stars.js'

const CTX = { today: '2026-10-15', joined_on: '2026-03-01', left_on: '' }

describe('recordProblem', () => {
  it('allows stars by hand for a by-hand rule, and an excuse for an automatic one', () => {
    expect(s.recordProblem({ date: '2026-10-14', excused: false, auto: '' }, CTX)).toBeNull()
    expect(s.recordProblem({ date: '2026-10-15', excused: true, auto: 'late' }, CTX)).toBeNull()
  })

  it('refuses a bad date, a future day and days outside employment', () => {
    expect(s.recordProblem({ date: '14-10-2026', excused: false, auto: '' }, CTX)).toMatch(/valid date/)
    expect(s.recordProblem({ date: '2026-10-16', excused: false, auto: '' }, CTX)).toMatch(/hasn’t happened/)
    expect(s.recordProblem({ date: '2026-02-27', excused: false, auto: '' }, CTX)).toMatch(/before they joined/)
    expect(s.recordProblem({ date: '2026-10-14', excused: false, auto: '' }, { ...CTX, left_on: '2026-10-10' })).toMatch(/after they left/)
  })

  it('keeps automatic and by-hand rules apart', () => {
    expect(s.recordProblem({ date: '2026-10-14', excused: false, auto: 'late' }, CTX)).toMatch(/automatically/)
    expect(s.recordProblem({ date: '2026-10-14', excused: true, auto: '' }, CTX)).toMatch(/Only automatic stars/)
  })
})

describe('givenPayload', () => {
  it('stores the names and the stars at the time', () => {
    expect(
      s.givenPayload({ id: 'r1', stars: 2, date: '2026-10-14', note: 'Phone in a client call' }, { rule: 'Phone use', givenBy: 'Ayesha' })
    ).toEqual({ record: 'r1', rule_name: 'Phone use', stars: 2, date: '2026-10-14', note: 'Phone in a client call', given_by_name: 'Ayesha' })
  })
})
