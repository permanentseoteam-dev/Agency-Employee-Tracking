import { effectiveRole, switchableRoles } from '@/lib/roles'
import { useRoleStore } from '@/stores/role'
import { useSession } from '@/stores/session'

/** The role the UI is currently showing, and the roles the user may switch to. */
export function useRole() {
  const stored = useSession((s) => s.user?.role)
  const selected = useRoleStore((s) => s.selected)
  const select = useRoleStore((s) => s.select)
  return {
    role: effectiveRole(selected, stored),
    options: switchableRoles(stored),
    select
  }
}
