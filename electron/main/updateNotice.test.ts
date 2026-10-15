import { describe, expect, it } from 'vitest'
import { isFirstStartAfterUpdate, readyNotice, updatedNotice } from './updateNotice'

describe('update notifications', () => {
  it('names the version and the two ways it installs', () => {
    const n = readyNotice('0.1.5')
    expect(n.title).toBe('PSEO Tracker 0.1.5 is ready')
    expect(n.body).toContain('Click here to restart and update now')
    expect(n.body).toContain('updates by itself when you are not being tracked')
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
