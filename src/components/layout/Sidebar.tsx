import { useState } from 'react'
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  Gauge,
  LayoutGrid,
  Plane,
  Radio,
  Search,
  SlidersHorizontal,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import { navFor, SECTION_LABEL, type NavIcon, type NavSection } from '@/lib/roles'
import logo from '@/assets/logo.png'
import { ProfileMenu } from './ProfileMenu'

const ICONS: Record<NavIcon, LucideIcon> = {
  stats: Gauge,
  attendance: CalendarCheck,
  leave: Plane,
  calendar: CalendarDays,
  project: Briefcase,
  live: Radio,
  grid: LayoutGrid,
  reports: BarChart3,
  org: Building2,
  rules: SlidersHorizontal,
  finance: Wallet
}

const SECTIONS: NavSection[] = ['personal', 'team', 'admin']

export function Sidebar() {
  const { role } = useRole()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const items = navFor(role).filter((item) => !q || item.label.toLowerCase().includes(q))

  return (
    <aside className="glass no-drag flex w-[248px] shrink-0 flex-col rounded-[var(--radius-shell)] px-3.5 pt-[22px] pb-4 rail:w-[76px] rail:px-3">
      <div className="mb-[22px] flex items-center gap-2.5 px-1 rail:justify-center rail:px-0">
        <img src={logo} alt="" className="size-9 rounded-[11px] shadow-[0_6px_14px_-8px_rgba(27,42,107,.6)]" />
        <span className="text-[17px] font-bold text-ink-900 rail:hidden">PSEO Tracker</span>
      </div>
      <label className="relative mb-3.5 block rail:hidden">
        <span className="sr-only">Search the menu</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-[var(--glass-strong)] pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        />
      </label>
      <nav className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1" aria-label="Main">
        {SECTIONS.map((section) => {
          const group = items.filter((item) => item.section === section)
          if (group.length === 0) return null
          return (
            <div key={section} className="flex flex-col gap-0.5">
              {section !== 'personal' && (
                <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-[.1em] text-ink-500 uppercase rail:sr-only">
                  {SECTION_LABEL[section]}
                </p>
              )}
              {group.map((item) => {
                const Icon = ICONS[item.icon]
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={item.label}
                    className={({ isActive }) =>
                      cn(
                        'group flex h-[42px] items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm transition-colors duration-200 rail:justify-center rail:px-0',
                        isActive
                          ? 'bg-[var(--nav-active-bg)] font-semibold text-indigo-700 shadow-[0_6px_16px_-10px_rgba(27,42,107,.4)] dark:text-indigo-200'
                          : 'font-medium text-ink-700 hover:bg-indigo-500/[.06] hover:text-indigo-700 dark:hover:text-indigo-200'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            'grid size-7 shrink-0 place-items-center rounded-lg',
                            isActive && 'bg-[image:var(--brand-gradient)] text-white'
                          )}
                        >
                          <Icon className={isActive ? 'size-[15px]' : 'size-[18px]'} strokeWidth={1.8} aria-hidden />
                        </span>
                        <span className="rail:sr-only">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
        {items.length === 0 && <p className="px-3 py-2 text-sm text-ink-500">No match</p>}
      </nav>
      <ProfileMenu />
    </aside>
  )
}
