import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import type { LeaveRequest, LeaveStatus } from '@/lib/leave'
import { dateRange, daysText } from '@/lib/notifications'
import { errorMessage } from '@/stores/session'
import { useDecideLeave } from './api'

export type Move = Exclude<LeaveStatus, 'pending'>

/** Button text for each move (also used on the list rows). */
export const MOVE_LABEL: Record<Move, string> = { approved: 'Approve', rejected: 'Reject', cancelled: 'Cancel leave' }

const PLACEHOLDER: Record<Move, string> = {
  approved: 'e.g. Get well soon',
  rejected: 'e.g. Busy week, please pick other dates',
  cancelled: 'e.g. Plans changed, agreed with the employee'
}

/** Approve or reject a pending request, or (admins) change a decision, with an optional comment. */
export function DecideDialog({ request, status, onClose }: { request: LeaveRequest; status: Move; onClose: () => void }) {
  const decide = useDecideLeave()
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const override = request.status !== 'pending'
  const title = override
    ? status === 'cancelled'
      ? 'Cancel approved leave'
      : `Change the decision to ${status === 'approved' ? 'approved' : 'rejected'}`
    : status === 'approved'
      ? 'Approve leave'
      : 'Reject leave'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await decide.mutateAsync({ id: request.id, status, comment })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the decision.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm">
          <span className="font-medium">{request.expand?.user?.full_name ?? 'Someone'}</span> ·{' '}
          {request.expand?.leave_type?.name ?? 'Leave'} · {dateRange(request.start_date, request.end_date)} ·{' '}
          {daysText(request.days, request.half_day)}
        </p>
        {override && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            This changes a decision already made
            {request.expand?.approver?.full_name ? ` by ${request.expand.approver.full_name}` : ''}.{' '}
            {status === 'cancelled' ? 'The days go back to their balance.' : 'The employee is notified.'} Attendance for days
            already passed is counted again.
          </p>
        )}
        <Field label="Comment (optional)" htmlFor="dc_comment">
          <textarea
            id="dc_comment"
            rows={3}
            maxLength={1000}
            autoFocus
            value={comment}
            placeholder={PLACEHOLDER[status]}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-[var(--radius-control)] border border-line bg-[var(--glass-strong)] px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </Field>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" variant={status === 'approved' ? 'primary' : 'danger'} loading={decide.isPending}>
            {MOVE_LABEL[status]}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
