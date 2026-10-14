import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/cn'

// The month view joins these tabs in M10b.
const TABS = [{ to: '/calendar/holidays', label: 'Holidays' }]

export function CalendarLayout() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="Calendar">
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
