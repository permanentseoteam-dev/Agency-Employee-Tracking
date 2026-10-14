import { describe, expect, it } from 'vitest'
import { canOpen, effectiveRole, landingFor, navFor, switchableRoles } from './roles'

describe('roles', () => {
  it('lets each role switch only to itself and lower roles', () => {
    expect(switchableRoles('admin')).toEqual(['admin', 'manager', 'employee'])
    expect(switchableRoles('manager')).toEqual(['manager', 'employee'])
    expect(switchableRoles('employee')).toEqual(['employee'])
    expect(switchableRoles(undefined)).toEqual(['employee'])
  })

  it('clamps a selected role the user may not use', () => {
    expect(effectiveRole('admin', 'employee')).toBe('employee')
    expect(effectiveRole('employee', 'admin')).toBe('employee')
    expect(effectiveRole(undefined, 'manager')).toBe('manager')
  })

  it('shows more navigation for higher roles', () => {
    const employee = navFor('employee').map((n) => n.path)
    const manager = navFor('manager').map((n) => n.path)
    const admin = navFor('admin').map((n) => n.path)
    expect(employee).toEqual(['/my-stats', '/my-attendance', '/my-leaves', '/calendar'])
    expect(manager).toContain('/live')
    expect(manager).not.toContain('/finance')
    expect(admin).toContain('/finance')
    expect(admin.length).toBeGreaterThan(manager.length)
  })

  it('lands each role on the right page', () => {
    expect(landingFor('employee')).toBe('/my-stats')
    expect(landingFor('manager')).toBe('/live')
    expect(landingFor('admin')).toBe('/live')
  })

  it('guards routes by role', () => {
    expect(canOpen('employee', '/finance')).toBe(false)
    expect(canOpen('employee', '/my-leaves')).toBe(true)
    expect(canOpen('employee', '/profile')).toBe(true)
    expect(canOpen('manager', '/approvals')).toBe(true)
    expect(canOpen('manager', '/rules')).toBe(false)
    expect(canOpen('admin', '/org/teams')).toBe(true)
  })
})
