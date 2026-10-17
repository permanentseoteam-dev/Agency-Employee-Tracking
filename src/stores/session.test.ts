import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UserRecord } from '@/lib/db'

// The store wires itself to Supabase auth and the tracker bridge when it loads: stub both.
vi.mock('@/lib/db', () => ({
  AppError: class AppError extends Error {},
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
  toUser: (row: Record<string, unknown>) => row
}))
vi.stubGlobal('window', {})
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })

const { useSession, waitForUser } = await import('./session')
const person = (id: string, role: UserRecord['role']) => ({ id, role, full_name: id, active: true }) as UserRecord

afterEach(() => {
  vi.useRealTimers()
  useSession.setState({ user: null })
})

describe('waitForUser (Switch role lands only after the store has the new account)', () => {
  it('resolves at once when the store already shows that account', async () => {
    useSession.setState({ user: person('admin1', 'admin') })
    await expect(waitForUser('admin1')).resolves.toBe(true)
  })

  it('waits for the deferred session update, ignoring the old account', async () => {
    useSession.setState({ user: person('emp1', 'employee') })
    let settled = false
    const wait = waitForUser('admin1').then((ok) => ((settled = true), ok))
    useSession.setState({ ready: true }) // an unrelated update: still the old account
    await Promise.resolve()
    expect(settled).toBe(false)
    useSession.setState({ user: person('admin1', 'admin') })
    await expect(wait).resolves.toBe(true)
  })

  it('gives up after the timeout (offline) so the switch still finishes', async () => {
    vi.useFakeTimers()
    useSession.setState({ user: person('emp1', 'employee') })
    const wait = waitForUser('admin1', 1000)
    vi.advanceTimersByTime(1000)
    await expect(wait).resolves.toBe(false)
  })
})
