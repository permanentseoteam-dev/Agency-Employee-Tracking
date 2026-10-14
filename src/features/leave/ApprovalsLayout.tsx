import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/approvals/pending', label: 'Pending' },
  { to: '/approvals/decided', label: 'Decided' },
  { to: '/approvals/balances', label: 'Team balances' }
]

export function ApprovalsLayout() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="Approvals">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
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
