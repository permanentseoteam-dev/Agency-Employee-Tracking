import { cn } from '@/lib/cn'
import { STATUS_LABEL, type AttendanceStatus } from '@/lib/attendance'

/** Colours per status, shared by the grid cells, badges and legend. */
export const STATUS_CLASS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  late: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  half_day: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  absent: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  on_leave: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  holiday: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  weekend: 'bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400'
}

export function AttendanceBadge({ status, className }: { status: AttendanceStatus; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[status], className)} data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  )
}
