import { describe, expect, it } from 'vitest'
import { boardStatus, liveStatus, presenceToday, reportCsv, reportTotals, totalsByDay, weekOf, type PresenceRecord, type ReportRow } from './tracking'

const NOW = Date.parse('2026-10-14T05:00:00.000Z') // Wed 10:00 in Karachi
const presence = (patch: Partial<PresenceRecord> = {}): PresenceRecord => ({
  id: 'p1',
  user: 'u1',
  status: 'idle',
  last_seen: new Date(NOW - 30_000).toISOString().replace('T', ' '),
  today_active_s: 3600,
  today_idle_s: 600,
  ...patch
})

describe('liveStatus', () => {
  it('shows the reported status while the heartbeat is fresh', () => {
    expect(liveStatus(presence(), NOW)).toBe('idle')
    expect(liveStatus(presence({ status: 'active' }), NOW)).toBe('active')
  })

  it('is Offline after 2 minutes without a heartbeat, or with no record', () => {
    expect(liveStatus(presence({ last_seen: new Date(NOW - 121_000).toISOString() }), NOW)).toBe('offline')
    expect(liveStatus(undefined, NOW)).toBe('offline')
    expect(liveStatus(presence({ last_seen: '' }), NOW)).toBe('offline')
  })
})

describe('boardStatus', () => {
  it('shows On leave for someone offline with approved leave today', () => {
    expect(boardStatus(undefined, NOW, true)).toBe('on_leave')
    expect(boardStatus(presence({ last_seen: new Date(NOW - 121_000).toISOString() }), NOW, true)).toBe('on_leave')
    expect(boardStatus(undefined, NOW, false)).toBe('offline')
  })

  it('keeps Active or Idle when someone on leave is working anyway', () => {
    expect(boardStatus(presence({ status: 'active' }), NOW, true)).toBe('active')
    expect(boardStatus(presence(), NOW, true)).toBe('idle')
  })
})

describe('presenceToday', () => {
  it('uses the totals from today’s heartbeat', () => {
    expect(presenceToday(presence(), NOW)).toEqual({ active_s: 3600, idle_s: 600 })
  })

  it('is zero when the last heartbeat was yesterday (Karachi time)', () => {
    // 18:59 UTC on the 13th is 23:59 on the 13th in Karachi.
    expect(presenceToday(presence({ last_seen: '2026-10-13 18:59:00.000Z' }), NOW)).toEqual({ active_s: 0, idle_s: 0 })
  })
})

describe('weekOf', () => {
  it('runs Monday to Sunday', () => {
    expect(weekOf('2026-10-14')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
    expect(weekOf('2026-10-18')[0]).toBe('2026-10-12')
  })
})

describe('totalsByDay', () => {
  it('sums by Karachi day and state', () => {
    const t = totalsByDay([
      { state: 'active', started_at: '2026-10-14 05:00:00.000Z', ended_at: '2026-10-14 05:05:00.000Z' },
      { state: 'idle', started_at: '2026-10-14 05:05:00.000Z', ended_at: '2026-10-14 05:06:00.000Z' },
      { state: 'active', started_at: '2026-10-13 19:30:00.000Z', ended_at: '2026-10-13 19:31:00.000Z' } // 00:30 on the 14th
    ])
    expect(t).toEqual({ '2026-10-14': { active_s: 360, idle_s: 60 } })
  })
})

describe('reportCsv', () => {
  const rows: ReportRow[] = [
    { user: 'u1', full_name: 'Ali Khan', team: 'SEO', period: '2026-10-14', active_s: 19380, idle_s: 1800 },
    { user: 'u2', full_name: 'Sara, "QA"', team: '', period: '2026-10-14', active_s: 3600, idle_s: 0 }
  ]

  it('matches the on-screen values and totals', () => {
    const lines = reportCsv(rows, 'Day').replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('Employee,Team,Day,Active,Idle,Active hours,Idle hours')
    expect(lines[1]).toBe('Ali Khan,SEO,2026-10-14,5h 23m,0h 30m,5.38,0.50')
    expect(lines[2]).toBe('"Sara, ""QA""",,2026-10-14,1h 0m,0h 0m,1.00,0.00')
    expect(lines[3]).toBe('Total,,,6h 23m,0h 30m,6.38,0.50')
    expect(reportTotals(rows)).toEqual({ active_s: 22980, idle_s: 1800 })
  })
})
