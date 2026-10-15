import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/finance/payroll', label: 'Payroll' },
  { to: '/finance/salaries', label: 'Salaries' }
]

const MY_PAY = '/finance/my-pay'

export function FinanceLayout() {
  const { role } = useRole()
  const { pathname } = useLocation()

  // Everyone sees Finance; only admins run payroll and set salaries. The rest see their own pay.
  if (role !== 'admin') {
    if (pathname !== MY_PAY) return <Navigate to={MY_PAY} replace />
    return (
      <div className="mx-auto max-w-6xl">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="Finance">
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
