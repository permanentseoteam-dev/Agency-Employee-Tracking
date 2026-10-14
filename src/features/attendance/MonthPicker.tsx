import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { monthLabel, shiftMonth } from '@/lib/attendance'

/** ‹ October 2026 › — never past `max` when one is given. */
export function MonthPicker({ month, max, onChange }: { month: string; max?: string; onChange(month: string): void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Month">
      <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <span className="w-36 text-center text-base font-semibold tabular-nums" data-month={month}>
        {monthLabel(month)}
      </span>
      <Button variant="ghost" size="sm" aria-label="Next month" disabled={max !== undefined && month >= max} onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
