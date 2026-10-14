import { Badge } from '@/components/ui/Badge'
import type { LeaveStatus } from '@/lib/leave'

const TONE = { pending: 'amber', approved: 'green', rejected: 'red', cancelled: 'neutral' } as const
const LABEL: Record<LeaveStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' }

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <Badge tone={TONE[status]} data-status={status}>
      {LABEL[status]}
    </Badge>
  )
}
