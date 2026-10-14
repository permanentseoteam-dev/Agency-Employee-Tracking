import { roleOf } from '@/lib/roles'
import { useSession } from '@/stores/session'

/** The role the UI shows: the signed-in account's own role. */
export function useRole() {
  const stored = useSession((s) => s.user?.role)
  return { role: roleOf(stored) }
}
