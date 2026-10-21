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
    // Own attendance is a tab in Attendance, approvals are tabs in My Leaves.
    expect(manager).toContain('/attendance')
    expect(manager).toContain('/calendar')
    expect(manager).not.toContain('/my-attendance')
    expect(manager).not.toContain('/approvals')
    expect(admin).not.toContain('/my-attendance')
    expect(manager).toContain('/finance')
    expect(admin).toContain('/finance')
    expect(manager).not.toContain('/org')
    expect(admin).toContain('/org')
    expect(admin.length).toBeGreaterThan(manager.length)
  })

  it('lands each role on the right page', () => {
    expect(landingFor('employee')).toBe('/my-stats')
    expect(landingFor('manager')).toBe('/my-stats')
    expect(landingFor('admin')).toBe('/my-stats')
  })

  it('guards routes by role', () => {
    expect(canOpen('employee', '/live')).toBe(false)
    expect(canOpen('employee', '/finance/my-pay')).toBe(true)
    expect(canOpen('manager', '/finance/my-pay')).toBe(true)
    expect(canOpen('employee', '/my-leaves')).toBe(true)
    expect(canOpen('employee', '/profile')).toBe(true)
    expect(canOpen('employee', '/calendar/month')).toBe(true)
    expect(canOpen('manager', '/calendar/month')).toBe(true)
    expect(canOpen('manager', '/my-leaves/pending')).toBe(true)
    expect(canOpen('manager', '/attendance/mine')).toBe(true)
    expect(canOpen('manager', '/my-attendance')).toBe(false)
    expect(canOpen('manager', '/rules')).toBe(true) // read-only for anyone but an admin
    expect(canOpen('employee', '/rules/stars')).toBe(true)
    expect(canOpen('admin', '/org/teams')).toBe(true)
  })
})
