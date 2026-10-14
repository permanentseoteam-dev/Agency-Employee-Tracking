import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  Gauge,
  LayoutGrid,
  Plane,
  Radio,
  SlidersHorizontal,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import { navFor, type NavIcon } from '@/lib/roles'
import logo from '@/assets/logo.png'

const ICONS: Record<NavIcon, LucideIcon> = {
  stats: Gauge,
  attendance: CalendarCheck,
  leave: Plane,
  calendar: CalendarDays,
  live: Radio,
  approvals: ClipboardCheck,
  grid: LayoutGrid,
  reports: BarChart3,
  org: Building2,
  rules: SlidersHorizontal,
  finance: Wallet
}

export function Sidebar() {
  const { role } = useRole()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
        <img src={logo} alt="" className="size-6 rounded-md" />
        <span className="font-semibold">PSEO Tracker</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main">
        {navFor(role).map((item) => {
          const Icon = ICONS[item.icon]
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
