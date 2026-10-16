import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'

export function EmptyState({ title, hint, icon: Icon = Inbox, action }: { title: string; hint?: string; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-[15px] font-semibold text-ink-900">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-ink-500">{hint}</p>}
      {action}
    </div>
  )
}
