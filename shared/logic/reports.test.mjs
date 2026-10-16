import { describe, expect, it } from 'vitest'
import reports from './reports.js'

describe('parseQuery', () => {
  it('turns local days into UTC bounds (Karachi is UTC+5)', () => {
    const { data, error } = reports.parseQuery({ from: '2026-10-12', to: '2026-10-14' }, 'Asia/Karachi')
    expect(error).toBeUndefined()
    expect(data.start).toBe('2026-10-11 19:00:00.000Z')
    expect(data.end).toBe('2026-10-14 19:00:00.000Z')
    expect(data.group).toBe('day')
  })

  it('keeps team and employee filters', () => {
    const { data } = reports.parseQuery({ from: '2026-10-01', to: '2026-10-31', group: 'week', team: ' t1 ', user: 'u1' })
    expect(data).toMatchObject({ group: 'week', team: 't1', user: 'u1' })
  })

  it.each([
    [{ from: '', to: '2026-10-14' }, 'valid date range'],
    [{ from: '2026-02-30', to: '2026-03-01' }, 'valid date range'],
    [{ from: '2026-10-14', to: '2026-10-13' }, 'on or after'],
    [{ from: '2026-10-01', to: '2026-10-02', group: 'year' }, 'day, week or month'],
    [{ from: '2024-01-01', to: '2026-01-01' }, 'at most one year']
  ])('rejects %o', (q, message) => {
    expect(reports.parseQuery(q, 'Asia/Karachi').error).toContain(message)
  })
})

describe('buildSql', () => {
  it('limits managers to the teams they manage', () => {
    expect(reports.buildSql('day', 300, 'managed', false, false)).toContain('t.manager = {:caller}')
    expect(reports.buildSql('day', 300, 'all', false, false)).not.toContain('{:caller}')
  })

  it('adds only the filters asked for, as bound parameters', () => {
    const sql = reports.buildSql('month', 300, 'all', true, true)
    expect(sql).toContain('u.team = {:team}')
    expect(sql).toContain('s.user = {:user}')
    expect(sql).toContain("strftime('%Y-%m', datetime(s.started_at, '+300 minutes'))")
  })

  it('groups weeks from Monday', () => {
    expect(reports.periodSql('week', 300)).toBe("date(datetime(s.started_at, '+300 minutes'), '-6 days', 'weekday 1')")
  })
})
