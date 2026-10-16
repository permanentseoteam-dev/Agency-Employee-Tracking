import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel, shiftMonth } from '@/lib/attendance'

const ARROW =
  'grid size-8 place-items-center rounded-full text-ink-700 transition-colors hover:bg-indigo-500/[.08] hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

/** ‹ October 2026 › in a glass pill, never past `max` when one is given. */
export function MonthPicker({ month, max, onChange }: { month: string; max?: string; onChange(month: string): void }) {
  return (
    <div className="glass inline-flex items-center gap-1 rounded-full p-1" role="group" aria-label="Month">
      <button type="button" className={ARROW} aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <span className="w-36 text-center text-[15px] font-semibold text-ink-900 tabular-nums" data-month={month}>
        {monthLabel(month)}
      </span>
      <button
        type="button"
        className={ARROW}
        aria-label="Next month"
        disabled={max !== undefined && month >= max}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  )
}
