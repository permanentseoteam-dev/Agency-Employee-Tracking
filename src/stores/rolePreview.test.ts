import { describe, expect, it, vi } from 'vitest'
import type { UserRecord } from '@/lib/db'

// The session store wires itself to Supabase auth and the tracker bridge when it loads: stub both.
vi.mock('@/lib/db', () => ({
  AppError: class AppError extends Error {},
  supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
  toUser: (row: Record<string, unknown>) => row
}))
vi.stubGlobal('window', {})
vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })

const { useSession } = await import('./session')
const { isPreviewing, useRolePreview } = await import('./rolePreview')
const person = (id: string, role: UserRecord['role']) => ({ id, role, full_name: id, active: true }) as UserRecord

describe('role preview (Admin chip)', () => {
  it('previews only for an admin, and "admin" means no preview', () => {
    useSession.setState({ user: person('a1', 'admin') })
    useRolePreview.getState().setPreview('employee')
    expect(isPreviewing()).toBe(true)
    useRolePreview.getState().setPreview('admin')
    expect(useRolePreview.getState().preview).toBeNull()
    expect(isPreviewing()).toBe(false)
  })

  it('never counts as previewing for a non-admin account', () => {
    useSession.setState({ user: person('m1', 'manager') })
    useRolePreview.setState({ preview: 'employee' })
    expect(isPreviewing()).toBe(false)
  })

  it('ends when the account changes (sign-out or another sign-in)', () => {
    useSession.setState({ user: person('a1', 'admin') })
    useRolePreview.getState().setPreview('manager')
    useSession.setState({ user: null })
    expect(useRolePreview.getState().preview).toBeNull()
  })
})
