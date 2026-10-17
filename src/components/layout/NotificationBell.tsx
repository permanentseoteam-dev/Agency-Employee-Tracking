import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, CheckCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarkAllRead, useMarkRead, useNotifications } from '@/features/notifications/api'
import { useNow, useTimezone } from '@/features/tracking/api'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import { notificationComment, notificationLink, notificationText, timeAgo } from '@/lib/notifications'
import { MenuBackdrop } from './MenuBackdrop'

/** Top-bar bell (plan §4.9): unread count, the latest notifications, mark read. */
export function NotificationBell() {
  const navigate = useNavigate()
  const { role } = useRole()
  const tz = useTimezone()
  const now = useNow(60_000)
  const notifications = useNotifications()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const items = notifications.data?.items ?? []
  const unread = notifications.data?.unread ?? 0
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      {open && <MenuBackdrop onClose={() => setOpen(false)} />}
      <DropdownMenu.Trigger
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="glass relative grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-ink-900 outline-none transition-transform duration-200 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <Bell className="size-[18px]" strokeWidth={1.8} aria-hidden />
        {unread > 0 && (
          <span
            data-unread-count={unread}
            className="absolute -top-1 -right-1 min-w-[18px] rounded-full bg-[var(--danger)] px-1 text-center text-[10px] leading-[18px] font-semibold text-white ring-2 ring-white dark:ring-slate-950"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="glass z-50 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-white/90 text-ink-900 dark:bg-slate-900/95"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault()
                  markAll.mutate()
                }}
                className="flex cursor-default items-center gap-1 rounded px-2 py-1 text-xs text-indigo-700 outline-none data-[highlighted]:bg-slate-100 dark:text-indigo-300 dark:data-[highlighted]:bg-slate-800"
              >
                <CheckCheck className="size-3.5" aria-hidden /> Mark all as read
              </DropdownMenu.Item>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto p-1">
            {notifications.isError ? (
              <p className="px-3 py-6 text-center text-sm text-red-600">Could not load notifications.</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">{notifications.isLoading ? 'Loading…' : 'You’re all caught up.'}</p>
            ) : (
              items.map((n) => {
                const { title, detail } = notificationText(n)
                const link = notificationLink(n, role)
                const isUnread = !n.read_at
                return (
                  <DropdownMenu.Item
                    key={n.id}
                    data-notification={n.type}
                    data-unread={isUnread}
                    onSelect={() => {
                      if (isUnread) markRead.mutate(n.id)
                      if (link) navigate(link)
                    }}
                    className="flex cursor-default gap-2 rounded px-2 py-2 outline-none data-[highlighted]:bg-slate-100 dark:data-[highlighted]:bg-slate-800"
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', isUnread ? 'bg-indigo-600' : 'bg-transparent')} aria-hidden />
                    <span className="min-w-0 flex-1 wrap-break-word">
                      <span className={cn('block text-sm', isUnread ? 'font-semibold' : 'text-slate-700 dark:text-slate-300')}>{title}</span>
                      {detail && <span className="block text-xs text-slate-500">{detail}</span>}
                      {notificationComment(n) && <span className="mt-0.5 block text-xs italic text-slate-500">“{notificationComment(n)}”</span>}
                      <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.created, now, tz)}</span>
                    </span>
                  </DropdownMenu.Item>
                )
              })
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
