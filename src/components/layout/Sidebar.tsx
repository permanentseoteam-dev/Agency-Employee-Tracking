import { useEffect, useState } from 'react'
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  Gauge,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
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
import { useSidebar } from '@/stores/sidebar'
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
  const collapsed = useSidebar((s) => s.collapsed)
  const toggle = useSidebar((s) => s.toggle)
  const [query, setQuery] = useState('')
  // As an icon rail the search box is hidden, so its filter must not hide menu items.
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 1099px)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 1099px)')
    if (!mq) return
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const q = collapsed || narrow ? '' : query.trim().toLowerCase()
  const items = navFor(role).filter((item) => !q || item.label.toLowerCase().includes(q))

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className="no-drag flex w-[248px] bg-[image:var(--sidebar-bg)] text-[var(--sidebar-text)] shadow-[var(--sidebar-shadow)] shrink-0 flex-col rounded-[var(--radius-shell)] px-3.5 pt-[22px] pb-4 transition-[width] duration-200 ease-[var(--ease)] rail:w-[76px] rail:px-3"
    >
      <div className="mb-[22px] flex items-center gap-2.5 px-1 rail:flex-col rail:gap-3 rail:px-0">
        <img src={logo} alt="" className="size-9 shrink-0 rounded-[11px] ring-1 ring-white/15" />
        <span className="truncate text-[17px] font-bold text-white rail:hidden">PSEO Tracker</span>
        {/* Narrow windows are always a rail, so the button only shows in wide ones. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-[var(--sidebar-hover)] hover:text-white rail:ml-0 max-[1099px]:hidden"
        >
          {collapsed ? <PanelLeftOpen className="size-[18px]" strokeWidth={1.8} aria-hidden /> : <PanelLeftClose className="size-[18px]" strokeWidth={1.8} aria-hidden />}
        </button>
      </div>
      <label className="relative mb-3.5 block rail:hidden">
        <span className="sr-only">Search the menu</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--sidebar-muted)]" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--sidebar-line)] bg-[var(--sidebar-field)] pr-3 pl-9 text-sm text-white placeholder:text-[var(--sidebar-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        />
      </label>
      {/* No visible scrollbar; on a short window the menu still scrolls with the wheel or touchpad. */}
      <nav
        className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Main"
      >
        {SECTIONS.map((section) => {
          const group = items.filter((item) => item.section === section)
          if (group.length === 0) return null
          return (
            <div key={section} className="flex flex-col gap-0.5">
              {section !== 'personal' && (
                <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-[.1em] text-[var(--sidebar-muted)] uppercase rail:sr-only">
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
                          ? 'bg-[var(--sidebar-active)] font-semibold text-white shadow-[0_10px_22px_-10px_rgba(47,91,255,.9),inset_0_1px_0_rgba(255,255,255,.18)]'
                          : 'font-medium text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover)] hover:text-white'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="grid size-7 shrink-0 place-items-center">
                          <Icon className="size-[18px]" strokeWidth={isActive ? 2 : 1.8} aria-hidden />
                        </span>
                        <span className="min-w-0 truncate rail:sr-only">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          )
        })}
        {items.length === 0 && <p className="px-3 py-2 text-sm text-[var(--sidebar-muted)]">No match</p>}
      </nav>
      <ProfileMenu />
    </aside>
  )
}
