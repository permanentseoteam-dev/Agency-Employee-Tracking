import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'

const MINE = '/my-leaves'

const TABS = [
  { to: MINE, label: 'My leaves' },
  { to: '/my-leaves/pending', label: 'Pending' },
  { to: '/my-leaves/decided', label: 'Decided' },
  { to: '/my-leaves/balances', label: 'Team balances' }
]

export function MyLeavesLayout() {
  const { role } = useRole()
  const { pathname } = useLocation()

  // Employees see only their own leave; managers and admins also approve here.
  if (role === 'employee') {
    if (pathname !== MINE) return <Navigate to={MINE} replace />
    return <Outlet />
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="My Leaves">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
                isActive
                  ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
