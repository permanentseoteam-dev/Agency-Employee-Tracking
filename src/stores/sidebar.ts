import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  /** Shown as the icon rail even in a wide window. */
  collapsed: boolean
  toggle(): void
}

export const useSidebar = create<SidebarState>()(
  persist((set) => ({ collapsed: false, toggle: () => set((s) => ({ collapsed: !s.collapsed })) }), { name: 'pseo-tracker-sidebar' })
)
