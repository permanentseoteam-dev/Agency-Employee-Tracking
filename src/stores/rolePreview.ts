import { create } from 'zustand'
import type { Role } from '@/lib/db'
import { useSession } from './session'

interface RolePreviewState {
  /** The role an admin is previewing (their own data, that role's menus and screens), or null. */
  preview: Role | null
  setPreview(role: Role | null): void
}

/** "View as Manager / Employee" from the Admin chip: layout only, read-only, never persisted. */
export const useRolePreview = create<RolePreviewState>((set) => ({
  preview: null,
  setPreview: (role) => set({ preview: role === 'admin' ? null : role })
}))

// A preview never outlives the account it was started on (sign-out, another sign-in).
useSession.subscribe((s, prev) => {
  if (s.user?.id !== prev.user?.id) useRolePreview.setState({ preview: null })
})

/** True while an admin previews another role: changes are refused (see main.tsx). */
export function isPreviewing(): boolean {
  return useRolePreview.getState().preview !== null && useSession.getState().user?.role === 'admin'
}
