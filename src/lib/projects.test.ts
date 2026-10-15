import { describe, expect, it } from 'vitest'
import { chipStatuses, countStatuses, sortByStatus, TEAM_STATUS_LABEL, type TeamStatus } from './projects'

describe('projects', () => {
  it('offers "Not in yet" only for today', () => {
    expect(chipStatuses(true)).toEqual(['present', 'late', 'half_day', 'absent', 'on_leave', 'not_in_yet'])
    expect(chipStatuses(false)).not.toContain('not_in_yet')
  })

  it('counts each status', () => {
    const rows = (['present', 'present', 'late', 'not_in_yet', ''] as TeamStatus[]).map((status) => ({ status }))
    const counts = countStatuses(rows)
    expect(counts.present).toBe(2)
    expect(counts.late).toBe(1)
    expect(counts.not_in_yet).toBe(1)
    expect(counts['']).toBe(1)
    expect(counts.absent).toBe(0)
  })

  it('lists who is in first, then who isn’t, then by name', () => {
    const rows = [
      { name: 'Zara', status: 'on_leave' as TeamStatus },
      { name: 'Bilal', status: 'not_in_yet' as TeamStatus },
      { name: 'Chand', status: 'late' as TeamStatus },
      { name: 'Asma', status: 'present' as TeamStatus },
      { name: 'Aamir', status: 'present' as TeamStatus }
    ]
    expect(sortByStatus(rows).map((r) => r.name)).toEqual(['Aamir', 'Asma', 'Chand', 'Bilal', 'Zara'])
  })

  it('labels every status, with a dash for none', () => {
    expect(TEAM_STATUS_LABEL.not_in_yet).toBe('Not in yet')
    expect(TEAM_STATUS_LABEL['']).toBe('—')
  })
})
