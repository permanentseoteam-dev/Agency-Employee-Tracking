import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { useOrgSettings } from '@/features/rules/api'
import { formatDate, DEFAULT_TZ } from '@/lib/dates'
import { allowedMoves, type LeaveRequest } from '@/lib/leave'
import { dateRange, daysText } from '@/lib/notifications'
import { useSession } from '@/stores/session'
import { useDecidedLeaves, useLeaveLive } from './api'
import { DecideDialog, MOVE_LABEL, type Move } from './DecideDialog'
import { LeaveStatusBadge } from './LeaveStatusBadge'
import { byKind, LeaveKindFilter, type LeaveKind } from './LeaveKindFilter'

/** The latest decided requests I can see. Admins can reverse a decision or cancel approved leave here. */
export function DecidedLeaves() {
  const user = useSession((s) => s.user)!
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const decided = useDecidedLeaves()
  useLeaveLive()
  const [changing, setChanging] = useState<{ request: LeaveRequest; status: Move } | null>(null)
  const [kind, setKind] = useState<LeaveKind>('all')
  const all = decided.data ?? []
  const requests = byKind(all, kind)

  return (
    <div className="space-y-4">
      {all.length > 0 && <LeaveKindFilter value={kind} onChange={setKind} />}
      <Card>
        {decided.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : decided.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the decisions.</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{all.length ? 'No requests of this kind.' : 'No decisions yet.'}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th className="text-right">Days</Th>
                <Th>Status</Th>
                <Th>Decision</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const moves = allowedMoves(
                  { id: user.id, role: user.role },
                  { user: r.user, status: r.status, requesterRole: r.expand?.user?.role }
                ) as Move[]
                return (
                  <tr key={r.id} data-request={r.id} data-status={r.status}>
                    <Td className="font-medium">{r.expand?.user?.full_name ?? '—'}</Td>
                    <Td>{r.expand?.leave_type?.name ?? '—'}</Td>
                    <Td className="tabular-nums">{dateRange(r.start_date, r.end_date)}</Td>
                    <Td className="text-right tabular-nums">{daysText(r.days, r.half_day)}</Td>
                    <Td>
                      <LeaveStatusBadge status={r.status} />
                    </Td>
                    <Td className="text-slate-600 dark:text-slate-400">
                      {r.decided_at ? (
                        <>
                          {r.expand?.approver?.full_name ?? 'Someone'} · {formatDate(r.decided_at.replace(' ', 'T'), tz)}
                          {r.comment && <span className="block text-xs italic">“{r.comment}”</span>}
                        </>
                      ) : (
                        'Cancelled by the employee'
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        {moves.map((m) => (
                          <Button key={m} size="sm" variant="secondary" onClick={() => setChanging({ request: r, status: m })}>
                            {MOVE_LABEL[m]}
                          </Button>
                        ))}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        The latest 50 decisions.{' '}
        {user.role === 'admin'
          ? 'As an admin you can change a decision: reject approved leave, approve a rejected request, or cancel approved leave.'
          : 'Only an admin can change a decision once it is made.'}
      </p>

      {changing && <DecideDialog request={changing.request} status={changing.status} onClose={() => setChanging(null)} />}
    </div>
  )
}
