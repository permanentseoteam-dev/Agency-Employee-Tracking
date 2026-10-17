import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import type { Role } from '@/lib/db'
import { landingFor, ROLE_LABEL } from '@/lib/roles'
import { useRolePreview } from '@/stores/rolePreview'

const CHIP = 'shrink-0 rounded-full bg-[var(--info-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--info-text)]'
const VIEWS: Role[] = ['admin', 'manager', 'employee']

/**
 * The signed-in account's role, top right. For an admin it opens "View as": the Manager or
 * Employee layout with the admin's own data, look-only (no other person's account is used).
 */
export function RoleBadge() {
  const { role, actualRole, previewing } = useRole()
  const setPreview = useRolePreview((s) => s.setPreview)
  const navigate = useNavigate()

  if (actualRole !== 'admin') {
    return (
      <span className={CHIP} data-role={role}>
        {ROLE_LABEL[role]}
      </span>
    )
  }

  function view(next: Role) {
    setPreview(next === 'admin' ? null : next)
    navigate(landingFor(next))
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="View the app as another role"
        data-role={role}
        data-previewing={previewing || undefined}
        className={cn(
          CHIP,
          'inline-flex items-center gap-1 outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-indigo-400',
          previewing && 'bg-[var(--warning-bg)] text-[var(--warning-text)]'
        )}
      >
        {previewing ? `Viewing as ${ROLE_LABEL[role]}` : ROLE_LABEL[role]}
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="glass z-50 min-w-56 rounded-2xl bg-white/95 p-1.5 text-ink-900 dark:bg-slate-900/95">
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[.08em] text-ink-500 uppercase">View the app as</DropdownMenu.Label>
          {VIEWS.map((v) => (
            <DropdownMenu.Item
              key={v}
              onSelect={() => view(v)}
              className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-indigo-500/[.08] data-[highlighted]:text-indigo-700 dark:data-[highlighted]:text-indigo-200"
            >
              <span className="grid size-4 place-items-center">{v === role && <Check className="size-4" aria-hidden />}</span>
              {v === 'admin' ? 'Admin (you)' : ROLE_LABEL[v]}
            </DropdownMenu.Item>
          ))}
          <p className="px-2.5 pt-1 pb-1.5 text-xs text-ink-500">Shows that role's menu and screens with your own data. Changes are switched off.</p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** Shown above the page while an admin previews another role. */
export function PreviewBanner() {
  const { role, previewing } = useRole()
  const setPreview = useRolePreview((s) => s.setPreview)
  const navigate = useNavigate()
  if (!previewing) return null
  return (
    <div
      role="status"
      data-preview-banner={role}
      className="mx-1.5 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] bg-[var(--warning-bg)] px-4 py-2.5 text-sm text-[var(--warning-text)]"
    >
      <span className="min-w-0 flex-1">
        <b>Previewing the {ROLE_LABEL[role]} view</b> with your own data. Changes are switched off.
      </span>
      <button
        type="button"
        onClick={() => {
          setPreview(null)
          navigate(landingFor('admin'))
        }}
        className="no-drag rounded-lg bg-white/70 px-3 py-1 font-semibold text-[var(--warning-text)] hover:bg-white dark:bg-white/10"
      >
        Back to Admin
      </button>
    </div>
  )
}
