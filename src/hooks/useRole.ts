import { roleOf } from '@/lib/roles'
import { useRolePreview } from '@/stores/rolePreview'
import { useSession } from '@/stores/session'

/**
 * The role the UI shows: the signed-in account's own role, or, for an admin previewing
 * another role from the Admin chip, that role. `actualRole` is always the account's own.
 */
export function useRole() {
  const actualRole = roleOf(useSession((s) => s.user?.role))
  const preview = useRolePreview((s) => s.preview)
  const previewing = actualRole === 'admin' && preview !== null
  return { role: previewing ? preview : actualRole, actualRole, previewing }
}
