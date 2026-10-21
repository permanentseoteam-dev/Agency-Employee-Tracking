// The only place UI role logic lives (plan §4.8). Data access is enforced
// separately by the server (row-level security); this file only shapes navigation.
import type { Role } from './db'

export const ROLES: Role[] = ['admin', 'manager', 'employee']

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee'
}

const RANK: Record<Role, number> = { employee: 0, manager: 1, admin: 2 }

export type NavIcon =
  | 'stats'
  | 'attendance'
  | 'leave'
  | 'calendar'
  | 'project'
  | 'live'
  | 'reports'
  | 'grid'
  | 'org'
  | 'rules'
  | 'finance'

export type NavSection = 'personal' | 'team' | 'admin'

/** Sidebar group labels; the personal group has no label. */
export const SECTION_LABEL: Record<NavSection, string> = { personal: 'Personal', team: 'Team', admin: 'Admin' }

export interface NavItem {
  path: string
  label: string
  icon: NavIcon
  minRole: Role
  /** Sidebar group (look only, no effect on access). */
  section: NavSection
  /** Roles that don't get this item even though they rank high enough. */
  hiddenFor?: Role[]
  /** Module that builds the screen, shown on placeholders until then. */
  module: string
}

export const NAV: NavItem[] = [
  { path: '/my-stats', label: 'My Stats', icon: 'stats', minRole: 'employee', section: 'personal', module: 'M6' },
  // Managers and admins see their own attendance as a tab inside Attendance.
  { path: '/my-attendance', label: 'My Attendance', icon: 'attendance', minRole: 'employee', section: 'personal', hiddenFor: ['manager', 'admin'], module: 'M7' },
  // Managers and admins approve leave from tabs inside My Leaves.
  { path: '/my-leaves', label: 'My Leaves', icon: 'leave', minRole: 'employee', section: 'personal', module: 'M8' },
  { path: '/calendar', label: 'Calendar', icon: 'calendar', minRole: 'employee', section: 'personal', module: 'M10' },
  // Everyone sees the clients they're on; only an admin sets up clients and their people.
  { path: '/projects', label: 'Project', icon: 'project', minRole: 'employee', section: 'team', module: 'Projects' },
  { path: '/live', label: 'Live Board', icon: 'live', minRole: 'manager', section: 'team', module: 'M6' },
  { path: '/attendance', label: 'Attendance', icon: 'grid', minRole: 'manager', section: 'team', module: 'M7' },
  { path: '/reports', label: 'Reports', icon: 'reports', minRole: 'manager', section: 'team', module: 'M6' },
  { path: '/org', label: 'Organization', icon: 'org', minRole: 'admin', section: 'admin', module: 'M3' },
  // Everyone reads the rules (work hours, leave, stars); only an admin changes them.
  { path: '/rules', label: 'Rules', icon: 'rules', minRole: 'employee', section: 'admin', module: 'M4' },
  // Employees and managers see their own pay (My pay, since 2026-10-21 for managers); admins everything.
  { path: '/finance', label: 'Finance', icon: 'finance', minRole: 'employee', section: 'admin', module: 'M11' }
]

/** Pages every signed-in user can open, whatever role is selected. */
export const COMMON_PATHS = ['/profile', '/settings']

export function hasRole(role: Role, minRole: Role): boolean {
  return RANK[role] >= RANK[minRole]
}

/**
 * The role the app shows: always the signed-in account's own role (an unknown one
 * counts as employee). Another role means another account, signed in with its
 * email and password ("Switch account"); there is no viewing as another role.
 */
export function roleOf(storedRole: Role | undefined): Role {
  return storedRole && storedRole in RANK ? storedRole : 'employee'
}

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => hasRole(role, item.minRole) && !item.hiddenFor?.includes(role))
}

/** The first page after signing in: My stats, for every role (2026-10-21). */
export function landingFor(_role: Role): string {
  return '/my-stats'
}

export function canOpen(role: Role, path: string): boolean {
  if (COMMON_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return true
  return navFor(role).some((item) => path === item.path || path.startsWith(`${item.path}/`))
}
