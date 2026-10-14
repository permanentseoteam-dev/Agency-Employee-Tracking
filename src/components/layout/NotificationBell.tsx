import { Bell } from 'lucide-react'

/** Placeholder until M9 wires it to the notifications collection. */
export function NotificationBell() {
  return (
    <button
      type="button"
      aria-label="Notifications"
      title="Notifications arrive in a later update"
      className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <Bell className="size-5" aria-hidden />
    </button>
  )
}
