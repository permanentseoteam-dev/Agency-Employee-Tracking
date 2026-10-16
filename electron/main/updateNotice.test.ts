import { describe, expect, it } from 'vitest'
import { isFirstStartAfterUpdate, updatedNotice, updatingNotice } from './updateNotice'

describe('update notifications', () => {
  it('says the update installs now, by itself, and keeps the tracked time', () => {
    const n = updatingNotice('0.1.9')
    expect(n.title).toBe('Updating PSEO Tracker to 0.1.9')
    expect(n.body).toContain('restarts in about 10 seconds')
    expect(n.body).toContain('tracked time is kept')
  })

  it('confirms an update after it installed', () => {
    expect(updatedNotice('0.1.5').title).toBe('PSEO Tracker updated to 0.1.5')
  })

  it.each([
    [null, '0.1.5', false], // first install: nothing to announce
    ['0.1.5', '0.1.5', false], // an ordinary restart
    ['0.1.4', '0.1.5', true] // updated
  ])('last %s, now %s → %s', (last, now, expected) => {
    expect(isFirstStartAfterUpdate(last, now)).toBe(expected)
  })
})
