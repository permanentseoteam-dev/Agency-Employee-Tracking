import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/lib/pb'

interface RoleState {
  /** Role picked in the top-bar switcher. Always read it through effectiveRole(). */
  selected: Role | undefined
  select(role: Role): void
}

export const useRoleStore = create<RoleState>()(
  persist(
    (set) => ({
      selected: undefined,
      select: (role) => set({ selected: role })
    }),
    { name: 'pseo-tracker-role' }
  )
)
