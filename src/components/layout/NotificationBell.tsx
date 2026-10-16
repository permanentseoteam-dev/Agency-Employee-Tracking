import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMarkAllRead, useMarkRead, useNotifications } from '@/features/notifications/api'
import { useNow, useTimezone } from '@/features/tracking/api'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import { notificationComment, notificationLink, notificationText, timeAgo } from '@/lib/notifications'

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

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative rounded-md p-2 text-slate-500 outline-none hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            data-unread-count={unread}
            className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-96 rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
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
                    <span className="min-w-0 flex-1">
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
