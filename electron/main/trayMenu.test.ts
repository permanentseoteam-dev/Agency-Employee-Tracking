import { describe, expect, it } from 'vitest'
import type { TrackerStatus } from '../preload/api'
import { trayModel } from './trayMenu'

const base: TrackerStatus = {
  state: 'active',
  reason: 'tracking',
  signedIn: true,
  role: 'employee',
  pending: 0,
  today: { date: '2026-10-14', active_s: 19380, idle_s: 2400 }
}

describe('trayModel', () => {
  it('has no Quit for employees', () => {
    expect(trayModel(base).canQuit).toBe(false)
  })

  it.each(['manager', 'admin'])('has Quit for %s', (role) => {
    expect(trayModel({ ...base, role }).canQuit).toBe(true)
  })

  it('shows today’s time as Xh Ym', () => {
    expect(trayModel(base).today).toBe('Today: 5h 23m active · 0h 40m idle')
  })

  it('shows the signed-out state and queued segments', () => {
    const m = trayModel({ ...base, signedIn: false, pending: 3 })
    expect(m.status).toBe('Signed out – sign in to sync')
    expect(m.tone).toBe('signedOut')
    expect(m.pending).toBe('3 segments waiting to sync')
  })

  it('explains why nothing is tracked', () => {
    expect(trayModel({ ...base, state: 'off', reason: 'outside_shift' }).status).toBe('Outside shift hours')
    expect(trayModel({ ...base, state: 'off', reason: 'locked' }).tone).toBe('off')
  })
})
