import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { allowedMoves, type LeaveBalance, type LeaveRequest } from '@/lib/leave'
import { dateRange, daysText } from '@/lib/notifications'
import { errorMessage, useSession } from '@/stores/session'
import { useDecideLeave, useLeaveBalances, useLeaveLive, usePendingApprovals } from './api'

type Decision = 'approved' | 'rejected'

/** Pending leave from the people I can decide for (my teams, or everyone for an admin). */
export function Approvals() {
  const user = useSession((s) => s.user)!
  const pending = usePendingApprovals()
  const balances = useLeaveBalances()
  useLeaveLive()
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; status: Decision } | null>(null)
  const requests = pending.data ?? []

  const balanceFor = (r: LeaveRequest): LeaveBalance | undefined =>
    (balances.data ?? []).find((b) => b.user === r.user && b.leave_type === r.leave_type)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Waiting for a decision{requests.length ? ` (${requests.length})` : ''}
      </h2>
      <Card>
        {pending.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : pending.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the requests.</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nothing waiting for you.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th className="text-right">Days</Th>
                <Th>Reason</Th>
                <Th className="text-right">Left this year</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const moves = allowedMoves(
                  { id: user.id, role: user.role },
                  { user: r.user, status: r.status, requesterRole: r.expand?.user?.role }
                )
                const paid = r.expand?.leave_type?.paid
                const balance = balanceFor(r)
                return (
                  <tr key={r.id} data-request={r.id}>
                    <Td className="font-medium">{r.expand?.user?.full_name ?? '—'}</Td>
                    <Td>{r.expand?.leave_type?.name ?? '—'}</Td>
                    <Td className="tabular-nums">{dateRange(r.start_date, r.end_date)}</Td>
                    <Td className="text-right tabular-nums">{daysText(r.days, r.half_day)}</Td>
                    <Td className="max-w-xs text-slate-600 dark:text-slate-400">{r.reason || '—'}</Td>
                    <Td className="text-right tabular-nums" data-left={balance?.remaining ?? ''}>
                      {!paid ? 'Unpaid' : balance ? `${balance.remaining} of ${balance.quota}` : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {moves.includes('approved') ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setDeciding({ request: r, status: 'approved' })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setDeciding({ request: r, status: 'rejected' })}>
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Decided by an admin</span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        “Left this year” is the paid quota minus approved days. A manager’s own leave goes to the admins, and nobody can approve
        their own request.
      </p>

      {deciding && <DecideDialog request={deciding.request} status={deciding.status} onClose={() => setDeciding(null)} />}
    </div>
  )
}

function DecideDialog({ request, status, onClose }: { request: LeaveRequest; status: Decision; onClose: () => void }) {
  const decide = useDecideLeave()
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const approving = status === 'approved'

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
    <Dialog open onClose={onClose} title={approving ? 'Approve leave' : 'Reject leave'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm">
          <span className="font-medium">{request.expand?.user?.full_name ?? 'Someone'}</span> ·{' '}
          {request.expand?.leave_type?.name ?? 'Leave'} · {dateRange(request.start_date, request.end_date)} ·{' '}
          {daysText(request.days, request.half_day)}
        </p>
        <Field label="Comment (optional)" htmlFor="dc_comment">
          <textarea
            id="dc_comment"
            rows={3}
            maxLength={1000}
            autoFocus
            value={comment}
            placeholder={approving ? 'e.g. Get well soon' : 'e.g. Busy week, please pick other dates'}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" variant={approving ? 'primary' : 'danger'} loading={decide.isPending}>
            {approving ? 'Approve' : 'Reject'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
