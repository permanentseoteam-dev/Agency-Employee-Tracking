import { Badge } from '@/components/ui/Badge'
import type { BoardStatus } from '@/lib/tracking'

export const STATUS_LABEL: Record<BoardStatus, string> = { active: 'Active', idle: 'Idle', offline: 'Offline', on_leave: 'On leave' }
const TONE = { active: 'green', idle: 'amber', offline: 'neutral', on_leave: 'blue' } as const
const DOT = { active: 'bg-emerald-500 pulse-dot', idle: 'bg-amber-500', offline: 'bg-slate-400', on_leave: 'bg-indigo-500' } as const

export function StatusBadge({ status }: { status: BoardStatus }) {
  return (
    <Badge tone={TONE[status]} data-status={status}>
      <span className={'mr-1.5 size-1.5 rounded-full ' + DOT[status]} aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  )
}
