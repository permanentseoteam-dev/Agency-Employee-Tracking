import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { SettingsSync } from '@/features/rules/api'
import { useRole } from '@/hooks/useRole'
import { canOpen, landingFor, NAV, ROLE_LABEL, SECTION_LABEL } from '@/lib/roles'
import { NotificationBell } from './NotificationBell'
import { AccountSwitcher } from './AccountSwitcher'
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

  const top = `/${pathname.split('/')[1]}`
  const title = TITLES[top] ?? ROLE_LABEL[role]
  const section = SECTION_LABEL[NAV.find((n) => n.path === top)?.section ?? 'personal']

  return (
    <div className="relative flex h-full gap-5 overflow-hidden p-4">
      {/* Decorative light behind the glass. */}
      <div aria-hidden className="hidden dark:block pointer-events-none absolute inset-0 -z-0 overflow-hidden dark:opacity-40">
        <div className="absolute -top-[120px] -left-[120px] size-[480px] rounded-full bg-[#5C84FF] opacity-35 blur-[110px]" />
        <div className="absolute -right-[100px] -bottom-[140px] size-[520px] rounded-full bg-[#2F5BFF] opacity-[.22] blur-[120px]" />
      </div>
      <SettingsSync />
      <div className="relative z-10 flex">
        <Sidebar />
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="drag flex shrink-0 items-end justify-between gap-4 px-1.5 pt-6 pb-4">
          <div className="min-w-40 flex-1">
            <p className="truncate text-[13px] text-ink-500">
              {section} / {title}
            </p>
            <h1 className="truncate text-[28px] leading-tight font-bold tracking-[-.02em] text-ink-900">{title}</h1>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2.5">
            <AccountSwitcher />
            <NotificationBell />
          </div>
        </header>
        <main className="-mx-2 flex-1 overflow-y-auto px-3.5 pt-2.5 pb-5">
          {/* @container: pages size themselves to this area (it changes with the sidebar), not to the window. */}
          <div key={top} className="page-enter @container/page">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
