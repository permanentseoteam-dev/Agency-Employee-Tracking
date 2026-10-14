import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { useLeaveTypes, useOrgSettings } from '@/features/rules/api'
import { formatDate, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { balanceRows, type LeaveRequest } from '@/lib/leave'
import { dateRange, daysText } from '@/lib/notifications'
import { errorMessage } from '@/stores/session'
import { useCancelLeave, useLeaveLive, useMyLeaves } from './api'
import { ApplyLeaveDialog } from './ApplyLeaveDialog'
import { LeaveStatusBadge } from './LeaveStatusBadge'

export function MyLeaves() {
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const today = toDateKey(Date.now(), tz)
  const year = today.slice(0, 4)
  const types = useLeaveTypes()
  const mine = useMyLeaves()
  const cancel = useCancelLeave()
  useLeaveLive()
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requests = mine.data ?? []
  const rows = balanceRows(types.data ?? [], requests, year)

  async function onCancel(r: LeaveRequest) {
    const what = `${r.expand?.leave_type?.name ?? 'leave'} on ${dateRange(r.start_date, r.end_date)}`
    if (!window.confirm(`Cancel your request for ${what}?`)) return
    setError(null)
    try {
      await cancel.mutateAsync(r.id)
    } catch (err) {
      setError(errorMessage(err, 'Could not cancel the request.'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Balances {year}</h2>
        <Button className="ml-auto" onClick={() => setApplying(true)}>
          Apply for leave
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Balances">
        {rows.map((row) => (
          <Card key={row.type.id} className="p-4" data-balance={row.type.name} data-left={row.left ?? ''}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.type.name}</span>
              {!row.type.paid && <Badge>Unpaid</Badge>}
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {row.left === null ? row.used : row.left}
              <span className="ml-1 text-sm font-normal text-slate-500">{row.left === null ? 'days taken' : `of ${row.quota} left`}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {row.used} used · {row.pending} pending{row.left === null ? ' · no yearly limit' : ''}
            </p>
          </Card>
        ))}
      </div>

      <FormError message={error} />
      <Card>
        {mine.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : mine.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load your leave requests.</p>
        ) : requests.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No leave requests yet. Use Apply for leave to send one.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th className="text-right">Days</Th>
                <Th>Status</Th>
                <Th>Decision</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} data-request={r.id} data-status={r.status}>
                  <Td>{r.expand?.leave_type?.name ?? '—'}</Td>
                  <Td className="tabular-nums">{dateRange(r.start_date, r.end_date)}</Td>
                  <Td className="text-right tabular-nums">{daysText(r.days, r.half_day)}</Td>
                  <Td>
                    <LeaveStatusBadge status={r.status} />
                  </Td>
                  <Td className="text-slate-600 dark:text-slate-400">
                    {r.status === 'pending' ? (
                      'Waiting for approval'
                    ) : r.decided_at ? (
                      <>
                        {r.expand?.approver?.full_name ?? 'Someone'} · {formatDate(r.decided_at.replace(' ', 'T'), tz)}
                        {r.comment && <span className="block text-xs italic">“{r.comment}”</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-right">
                    {r.status === 'pending' && (
                      <Button variant="ghost" size="sm" loading={cancel.isPending && cancel.variables === r.id} onClick={() => void onCancel(r)}>
                        Cancel
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        Only working days count (weekends and holidays don’t). Paid leave can’t go past the yearly quota; pending requests count
        towards it until they are decided.
      </p>

      {applying && <ApplyLeaveDialog today={today} mine={requests} onClose={() => setApplying(false)} />}
    </div>
  )
}
