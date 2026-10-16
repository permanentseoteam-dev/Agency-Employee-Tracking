import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { LogOut, Power, Settings, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ROLE_LABEL } from '@/lib/roles'
import { useSession } from '@/stores/session'
import { Avatar } from './Avatar'

const ITEM =
  'flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-indigo-500/[.08] data-[highlighted]:text-indigo-700 dark:data-[highlighted]:text-indigo-200'

export function ProfileMenu() {
  const user = useSession((s) => s.user)!
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return (
    <DropdownMenu.Root>
      {/* The sidebar's bottom card: who is signed in; it opens the account menu. */}
      <DropdownMenu.Trigger
        aria-label="Profile menu"
        className="mt-3 w-full rounded-[var(--radius-inner)] bg-[image:var(--brand-gradient-deep)] p-3 text-left text-white shadow-[0_14px_30px_-16px_rgba(27,42,107,.8)] outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-indigo-300 rail:p-2"
      >
        <span className="flex items-center gap-2 rail:justify-center">
          <Avatar user={user} size={28} className="shrink-0 bg-white/20 text-white ring-0 dark:bg-white/20 dark:text-white" />
          <span className="min-w-0 truncate text-[13px] rail:hidden">
            {user.full_name || user.email} · {ROLE_LABEL[user.role]}
          </span>
        </span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="end"
          sideOffset={12}
          className="glass z-50 min-w-56 rounded-2xl bg-white/90 p-1.5 text-ink-900 dark:bg-slate-900/95"
        >
          <div className="px-2 py-2">
            <p className="text-sm font-medium">{user.full_name || user.email}</p>
            <p className="text-xs text-ink-500">{user.email}</p>
            <p className="text-xs text-ink-500">{ROLE_LABEL[user.role]}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--line-strong)]" />
          <DropdownMenu.Item className={ITEM} onSelect={() => navigate('/profile')}>
            <User className="size-4" aria-hidden /> My Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={() => navigate('/settings')}>
            <Settings className="size-4" aria-hidden /> Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--line-strong)]" />
          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => {
              queryClient.clear()
              logout()
            }}
          >
            <LogOut className="size-4" aria-hidden /> Log out
          </DropdownMenu.Item>
          {/* Managers and admins only; the main process checks the same rule again. */}
          {(user.role === 'manager' || user.role === 'admin') && window.tracker && (
            <DropdownMenu.Item className={ITEM} onSelect={() => void window.tracker.quit()}>
              <Power className="size-4" aria-hidden /> Quit PSEO Tracker
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
