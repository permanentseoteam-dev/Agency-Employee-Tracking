import { Badge } from '@/components/ui/Badge'
import type { LiveStatus } from '@/lib/tracking'

const LABEL: Record<LiveStatus, string> = { active: 'Active', idle: 'Idle', offline: 'Offline' }
const TONE = { active: 'green', idle: 'amber', offline: 'neutral' } as const

export function StatusBadge({ status }: { status: LiveStatus }) {
  return (
    <Badge tone={TONE[status]} data-status={status}>
      <span
        className={
          'mr-1.5 size-1.5 rounded-full ' +
          (status === 'active' ? 'bg-emerald-500' : status === 'idle' ? 'bg-amber-500' : 'bg-slate-400')
        }
        aria-hidden
      />
      {LABEL[status]}
    </Badge>
  )
}
