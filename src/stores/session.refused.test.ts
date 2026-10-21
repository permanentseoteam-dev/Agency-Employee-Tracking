import { beforeEach, describe, expect, it, vi } from 'vitest'

// A pretend Supabase whose answers each test sets: is there a sign-in here, and what does the
// server say about it (live: 200; ended: 403 session_not_found, as live answers a dead token).
const auth = vi.hoisted(() => ({ session: null as unknown, userError: null as null | { status: number; message: string }, signedOut: 0 }))
vi.mock('@/lib/db', () => ({
  AppError: class AppError extends Error {},
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: auth.session } }),
      getUser: async () => ({ data: {}, error: auth.userError }),
      signOut: async () => {
        auth.signedOut++
        return { error: null }
      }
    }
  },
  toUser: (row: Record<string, unknown>) => row
}))
vi.stubGlobal('window', { tracker: { logInfo() {}, onSessionExpired() {} } })
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })

const { endIfSignInRefused } = await import('./session')

describe('an empty answer while signed in: is the sign-in still good?', () => {
  beforeEach(() => {
    auth.session = { access_token: 't' }
    auth.userError = null
    auth.signedOut = 0
  })

  it('the server ended the session (403): signs out, so the sign-in screen shows', async () => {
    auth.userError = { status: 403, message: 'Session from session_id claim in JWT does not exist' }
    expect(await endIfSignInRefused('test')).toBe(true)
    expect(auth.signedOut).toBe(1)
  })

  it('the session is fine: stays signed in', async () => {
    expect(await endIfSignInRefused('test')).toBe(false)
    expect(auth.signedOut).toBe(0)
  })

  it('a server or connection problem is not a refusal: stays signed in', async () => {
    auth.userError = { status: 500, message: 'oops' }
    expect(await endIfSignInRefused('test')).toBe(false)
    auth.userError = { status: 0, message: 'offline' }
    expect(await endIfSignInRefused('test')).toBe(false)
    expect(auth.signedOut).toBe(0)
  })

  it('nobody signed in here: nothing to check', async () => {
    auth.session = null
    expect(await endIfSignInRefused('test')).toBe(false)
  })
})
