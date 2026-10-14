import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { LogOut, Power, Settings, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ROLE_LABEL } from '@/lib/roles'
import { useSession } from '@/stores/session'
import { Avatar } from './Avatar'

const ITEM =
  'flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800'

export function ProfileMenu() {
  const user = useSession((s) => s.user)!
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Profile menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <Avatar user={user} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-56 rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        >
          <div className="px-2 py-2">
            <p className="text-sm font-medium">{user.full_name || user.email}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
          <DropdownMenu.Item className={ITEM} onSelect={() => navigate('/profile')}>
            <User className="size-4" aria-hidden /> My Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item className={ITEM} onSelect={() => navigate('/settings')}>
            <Settings className="size-4" aria-hidden /> Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
          <DropdownMenu.Item
            className={ITEM}
            onSelect={() => {
              queryClient.clear()
              logout()
            }}
          >
            <LogOut className="size-4" aria-hidden /> Log out
          </DropdownMenu.Item>
          {/* The stored role, not "View as": the main process checks it again. */}
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
