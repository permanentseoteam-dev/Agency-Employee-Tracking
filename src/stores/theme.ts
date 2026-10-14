import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  setTheme(theme: Theme): void
}

function apply(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        apply(theme)
        set({ theme })
      }
    }),
    {
      name: 'pseo-tracker-theme',
      onRehydrateStorage: () => (state) => apply(state?.theme ?? 'light')
    }
  )
)
