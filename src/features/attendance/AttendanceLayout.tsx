import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/cn'

// Managers and admins only; employees keep My Attendance in the sidebar.
const TABS = [
  { to: '/attendance/team', label: 'Team' },
  { to: '/attendance/mine', label: 'My attendance' }
]

export function AttendanceLayout() {
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="Attendance">
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
