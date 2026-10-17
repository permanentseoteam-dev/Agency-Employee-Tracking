import { describe, expect, it, vi } from 'vitest'

// The store wires itself to Supabase auth and the tracker bridge when it loads: stub both.
vi.mock('@/lib/db', () => ({
  AppError: class AppError extends Error {},
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
  toUser: (row: Record<string, unknown>) => row
}))
vi.stubGlobal('window', {})
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })

const { forgetAtStart } = await import('./session')

describe('Remember me', () => {
  it('keeps the session when Remember me was on, or never set (older sign-ins)', () => {
    expect(forgetAtStart('true', null)).toBe(false)
    expect(forgetAtStart(null, null)).toBe(false)
  })

  it('asks for the password again on a new start when Remember me was off', () => {
    expect(forgetAtStart('false', null)).toBe(true)
  })

  it('does not sign out on a reload of the same app window', () => {
    expect(forgetAtStart('false', '1')).toBe(false)
  })
})
