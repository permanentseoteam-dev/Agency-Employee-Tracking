import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Explanatory note: brand tint, info icon. */
export function InfoBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-2.5 rounded-[var(--radius-control)] bg-indigo-50 px-4 py-3 text-[13px] text-ink-700 dark:bg-indigo-500/10', className)}>
      <Info className="mt-px size-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
      <div>{children}</div>
    </div>
  )
}
