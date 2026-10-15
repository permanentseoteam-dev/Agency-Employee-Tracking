import { describe, expect, it } from 'vitest'
import { canOpen, landingFor, navFor, roleOf } from './roles'

describe('roles', () => {
  it('always shows the account’s own role (no viewing as another role)', () => {
    expect(roleOf('admin')).toBe('admin')
    expect(roleOf('manager')).toBe('manager')
    expect(roleOf('employee')).toBe('employee')
  })

  it('treats a missing or unknown role as employee', () => {
    expect(roleOf(undefined)).toBe('employee')
    expect(roleOf('owner' as never)).toBe('employee')
  })

  it('shows more navigation for higher roles', () => {
    const employee = navFor('employee').map((n) => n.path)
    const manager = navFor('manager').map((n) => n.path)
    const admin = navFor('admin').map((n) => n.path)
    expect(employee).toEqual(['/my-stats', '/my-attendance', '/my-leaves', '/calendar', '/projects', '/rules', '/finance'])
    expect(manager).toContain('/live')
    expect(manager).toContain('/finance')
    expect(manager).not.toContain('/org')
    expect(admin).toContain('/org')
    expect(admin.length).toBeGreaterThan(manager.length)
  })

  it('lands each role on the right page', () => {
    expect(landingFor('employee')).toBe('/my-stats')
    expect(landingFor('manager')).toBe('/live')
    expect(landingFor('admin')).toBe('/live')
  })

  it('guards routes by role', () => {
    expect(canOpen('employee', '/live')).toBe(false)
    expect(canOpen('employee', '/finance/my-pay')).toBe(true)
    expect(canOpen('employee', '/my-leaves')).toBe(true)
    expect(canOpen('employee', '/profile')).toBe(true)
    expect(canOpen('manager', '/approvals')).toBe(true)
    expect(canOpen('manager', '/rules')).toBe(true) // read-only for anyone but an admin
    expect(canOpen('employee', '/rules/stars')).toBe(true)
    expect(canOpen('admin', '/org/teams')).toBe(true)
  })
})
