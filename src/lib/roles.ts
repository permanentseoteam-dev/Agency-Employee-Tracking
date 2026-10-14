// The only place UI role logic lives (plan §4.8). Data access is enforced
// separately by the PocketBase API rules; this file only shapes navigation.
import type { Role } from './pb'

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
  | 'live'
  | 'approvals'
  | 'reports'
  | 'grid'
  | 'org'
  | 'rules'
  | 'finance'

export interface NavItem {
  path: string
  label: string
  icon: NavIcon
  minRole: Role
  /** Module that builds the screen, shown on placeholders until then. */
  module: string
}

export const NAV: NavItem[] = [
  { path: '/my-stats', label: 'My Stats', icon: 'stats', minRole: 'employee', module: 'M6' },
  { path: '/my-attendance', label: 'My Attendance', icon: 'attendance', minRole: 'employee', module: 'M7' },
  { path: '/my-leaves', label: 'My Leaves', icon: 'leave', minRole: 'employee', module: 'M8' },
  { path: '/calendar', label: 'Calendar', icon: 'calendar', minRole: 'employee', module: 'M10' },
  { path: '/live', label: 'Live Board', icon: 'live', minRole: 'manager', module: 'M6' },
  { path: '/approvals', label: 'Approvals', icon: 'approvals', minRole: 'manager', module: 'M8' },
  { path: '/attendance', label: 'Attendance', icon: 'grid', minRole: 'manager', module: 'M7' },
  { path: '/reports', label: 'Reports', icon: 'reports', minRole: 'manager', module: 'M6' },
  { path: '/org', label: 'Organization', icon: 'org', minRole: 'admin', module: 'M3' },
  { path: '/rules', label: 'Rules', icon: 'rules', minRole: 'admin', module: 'M4' },
  { path: '/finance', label: 'Finance', icon: 'finance', minRole: 'admin', module: 'M11' }
]

/** Pages every signed-in user can open, whatever role is selected. */
export const COMMON_PATHS = ['/profile', '/settings']

export function hasRole(role: Role, minRole: Role): boolean {
  return RANK[role] >= RANK[minRole]
}

/** The roles a user may switch to: their stored role and the ones below it. */
export function switchableRoles(storedRole: Role | undefined): Role[] {
  if (!storedRole || !(storedRole in RANK)) return ['employee']
  return ROLES.filter((r) => RANK[r] <= RANK[storedRole])
}

/** Clamp a selected role to what the stored role allows. */
export function effectiveRole(selected: Role | undefined, storedRole: Role | undefined): Role {
  const allowed = switchableRoles(storedRole)
  return selected && allowed.includes(selected) ? selected : allowed[0]
}

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => hasRole(role, item.minRole))
}

export function landingFor(role: Role): string {
  return role === 'employee' ? '/my-stats' : '/live'
}

export function canOpen(role: Role, path: string): boolean {
  if (COMMON_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return true
  return navFor(role).some((item) => path === item.path || path.startsWith(`${item.path}/`))
}
