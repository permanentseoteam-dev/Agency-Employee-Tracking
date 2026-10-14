import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { SettingsSync } from '@/features/rules/api'
import { useRole } from '@/hooks/useRole'
import { canOpen, landingFor, NAV, ROLE_LABEL } from '@/lib/roles'
import { NotificationBell } from './NotificationBell'
import { ProfileMenu } from './ProfileMenu'
import { RoleSwitcher } from './RoleSwitcher'
import { Sidebar } from './Sidebar'

const TITLES: Record<string, string> = {
  ...Object.fromEntries(NAV.map((n) => [n.path, n.label])),
  '/profile': 'My Profile',
  '/settings': 'Settings'
}

export function AppShell() {
  const { role } = useRole()
  const { pathname } = useLocation()

  // Route guard: a page outside the selected role goes back to that role's landing page.
  if (pathname === '/' || !canOpen(role, pathname)) {
    return <Navigate to={landingFor(role)} replace />
  }

  const title = TITLES[`/${pathname.split('/')[1]}`] ?? ROLE_LABEL[role]

  return (
    <div className="flex h-full">
      <SettingsSync />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex items-center gap-4">
            <RoleSwitcher />
            <NotificationBell />
            <ProfileMenu />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 dark:bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
