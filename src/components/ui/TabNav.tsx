import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'

/** Segmented pill tabs, one link per sub-page. `end` matches the exact path only. */
export function TabNav({ label, tabs }: { label: string; tabs: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="inline-flex flex-wrap gap-1 rounded-full bg-[rgba(27,42,107,.06)] p-1 dark:bg-white/[.06]" aria-label={label}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200',
              isActive
                ? 'bg-[var(--nav-active-bg)] text-indigo-700 shadow-[0_4px_12px_-6px_rgba(27,42,107,.35)] dark:text-indigo-200'
                : 'text-ink-500 hover:text-ink-900'
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
