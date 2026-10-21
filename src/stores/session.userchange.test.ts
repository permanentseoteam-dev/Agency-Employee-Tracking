import { describe, expect, it, vi } from 'vitest'

// A pretend Supabase: any sign-in works (a@… is user A, anyone else user B), and Log out tells the
// store it signed out, the way Supabase's auth events do.
const auth = vi.hoisted(() => ({ handler: null as null | ((event: string, session: unknown) => void) }))
vi.mock('@/lib/db', () => ({
  AppError: class AppError extends Error {},
  supabase: {
    auth: {
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
        auth.handler = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
      signInWithPassword: async ({ email }: { email: string }) => ({
        data: { session: { access_token: `token-${email}`, user: { id: email.startsWith('a@') ? 'A' : 'B', email } } },
        error: null
      }),
      signOut: async () => {
        auth.handler?.('SIGNED_OUT', null)
        return { error: null }
      }
    },
    from: () => ({ select: () => ({ eq: (_column: string, id: string) => ({ maybeSingle: async () => ({ data: { id, role: 'employee' }, error: null }) }) }) })
  },
  toUser: (row: Record<string, unknown>, email: string) => ({ ...row, email })
}))
vi.stubGlobal('window', { tracker: { setSession() {}, logInfo() {}, onSessionExpired() {} }, location: { hash: '' } })
const storage = () => ({ getItem: () => null, setItem() {}, removeItem() {} })
vi.stubGlobal('localStorage', storage())
vi.stubGlobal('sessionStorage', storage())

const { setOnUserChange, useSession } = await import('./session')
const tick = () => new Promise((r) => setTimeout(r, 5))

describe('switching who is signed in drops the cached answers', () => {
  it('on every change of person, and not when the same person signs in again', async () => {
    const changed = vi.fn()
    setOnUserChange(changed)

    await useSession.getState().login('a@example.test', 'dummy')
    expect(useSession.getState().user?.id).toBe('A')
    expect(changed).toHaveBeenCalledTimes(1)

    useSession.getState().logout()
    await tick()
    expect(useSession.getState().user).toBeNull()
    expect(changed).toHaveBeenCalledTimes(2)

    await useSession.getState().login('b@example.test', 'dummy')
    expect(useSession.getState().user?.id).toBe('B')
    expect(changed).toHaveBeenCalledTimes(3)

    await useSession.getState().login('b@example.test', 'dummy')
    expect(changed).toHaveBeenCalledTimes(3)
  })
})
