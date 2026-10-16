import { cn } from '@/lib/cn'
import { STATUS_LABEL, type AttendanceStatus } from '@/lib/attendance'

/** Colours per status, shared by the grid cells, badges and legend. */
export const STATUS_CLASS: Record<AttendanceStatus, string> = {
  present: 'bg-[var(--success-bg)] text-[var(--success-text)]',
  late: 'bg-[var(--warning-bg)] text-[var(--warning-text)]',
  half_day: 'bg-[var(--orange-bg)] text-[var(--orange-text)]',
  absent: 'bg-[var(--danger-bg)] text-[var(--danger-text)]',
  on_leave: 'bg-[var(--info-bg)] text-[var(--info-text)]',
  holiday: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  weekend: 'bg-[var(--neutral-bg)] text-[var(--neutral-text)]'
}

export function AttendanceBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap', STATUS_CLASS[status], className)} data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  )
}
