import { useRole } from '@/hooks/useRole'
import { ROLE_LABEL } from '@/lib/roles'

/** The signed-in account's role, top right. */
export function RoleBadge() {
  const { role } = useRole()
  return (
    <span className="shrink-0 rounded-full bg-[var(--info-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--info-text)]" data-role={role}>
      {ROLE_LABEL[role]}
    </span>
  )
}
