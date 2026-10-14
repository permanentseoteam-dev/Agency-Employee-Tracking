import { describe, expect, it } from 'vitest'
import { countStatuses, employedOn, monthDays, monthLabel, recomputeRange, shiftMonth } from './attendance'

describe('months', () => {
  it('lists every day of a month, including leap February', () => {
    expect(monthDays('2026-10')).toHaveLength(31)
    expect(monthDays('2026-10')[30]).toBe('2026-10-31')
    expect(monthDays('2028-02')).toHaveLength(29)
  })

  it('moves across year ends', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('names a month', () => {
    expect(monthLabel('2026-10')).toBe('October 2026')
  })
})

describe('recomputeRange', () => {
  it('stops at yesterday in the current month', () => {
    expect(recomputeRange('2026-10', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-13' })
  })

  it('covers a whole past month', () => {
    expect(recomputeRange('2026-09', '2026-10-14')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('is empty when no day of the month has finished', () => {
    expect(recomputeRange('2026-10', '2026-10-01')).toBeNull()
    expect(recomputeRange('2026-11', '2026-10-14')).toBeNull()
  })
})

describe('totals and employment', () => {
  it('counts each status', () => {
    const c = countStatuses([{ status: 'present' }, { status: 'late' }, { status: 'present' }, { status: 'weekend' }])
    expect(c).toMatchObject({ present: 2, late: 1, absent: 0, weekend: 1 })
  })

  it('knows the joining and leaving window', () => {
    expect(employedOn('2026-10-04', { joined_on: '2026-10-05' })).toBe(false)
    expect(employedOn('2026-10-05', { joined_on: '2026-10-05', left_on: '' })).toBe(true)
    expect(employedOn('2026-10-10', { joined_on: '', left_on: '2026-10-09' })).toBe(false)
  })
})
