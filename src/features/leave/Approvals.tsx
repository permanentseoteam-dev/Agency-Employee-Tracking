import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { allowedMoves, type LeaveBalance, type LeaveRequest } from '@/lib/leave'
import { dateRange, daysText } from '@/lib/notifications'
import { useSession } from '@/stores/session'
import { useLeaveBalances, useLeaveLive, usePendingApprovals } from './api'
import { DecideDialog, type Move } from './DecideDialog'
import { byKind, LeaveKindFilter, type LeaveKind } from './LeaveKindFilter'

/** Pending leave from the people I can decide for (my teams, or everyone for an admin). */
export function Approvals() {
  const user = useSession((s) => s.user)!
  const pending = usePendingApprovals()
  const balances = useLeaveBalances()
  useLeaveLive()
  const [deciding, setDeciding] = useState<{ request: LeaveRequest; status: Move } | null>(null)
  const [kind, setKind] = useState<LeaveKind>('all')
  const all = pending.data ?? []
  const requests = byKind(all, kind)

  const balanceFor = (r: LeaveRequest): LeaveBalance | undefined =>
    (balances.data ?? []).find((b) => b.user === r.user && b.leave_type === r.leave_type)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Waiting for a decision{all.length ? ` (${all.length})` : ''}
        </h2>
        {all.length > 0 && (
          <div className="ml-auto">
            <LeaveKindFilter value={kind} onChange={setKind} />
          </div>
        )}
      </div>
      <Card>
        {pending.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : pending.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the requests.</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{all.length ? 'No requests of this kind.' : 'Nothing waiting for you.'}</p>
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
                    <Td className="whitespace-nowrap tabular-nums">{dateRange(r.start_date, r.end_date)}</Td>
                    <Td className="text-right tabular-nums">{daysText(r.days, r.half_day)}</Td>
                    <Td className="max-w-xs text-slate-600 wrap-anywhere dark:text-slate-400">{r.reason || '—'}</Td>
                    <Td className="text-right tabular-nums" data-left={balance?.remaining ?? ''}>
                      {!paid ? 'Unpaid' : balance ? `${balance.remaining} of ${balance.quota}` : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {moves.includes('approved') ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setDeciding({ request: r, status: 'approved' })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="danger-soft" onClick={() => setDeciding({ request: r, status: 'rejected' })}>
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
