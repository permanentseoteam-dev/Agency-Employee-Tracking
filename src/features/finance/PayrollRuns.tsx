import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { InfoBanner } from '@/components/ui/InfoBanner'
import { Field, Input } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { useTimezone } from '@/features/tracking/api'
import { monthLabel, monthOf, shiftMonth } from '@/lib/attendance'
import { formatDate, toDateKey } from '@/lib/dates'
import { formatPkr } from '@/lib/payroll'
import { errorMessage } from '@/stores/session'
import { usePayrollRuns, useRunPayroll } from './api'

export function RunStatusBadge({ status }: { status: 'draft' | 'finalized' }) {
  return status === 'finalized' ? <Badge tone="green">Finalized</Badge> : <Badge tone="amber">Draft</Badge>
}

export function PayrollRuns() {
  const navigate = useNavigate()
  const tz = useTimezone()
  const current = monthOf(toDateKey(Date.now(), tz))
  const [month, setMonth] = useState(() => shiftMonth(current, -1))
  const runs = usePayrollRuns()
  const runPayroll = useRunPayroll()
  const [error, setError] = useState<string | null>(null)

  const existing = runs.data?.find((r) => r.month === month)
  const finalized = existing?.status === 'finalized'

  async function onRun() {
    setError(null)
    try {
      const result = await runPayroll.mutateAsync(month)
      navigate(`/finance/payroll/${result.run}`, { state: { result } })
    } catch (err) {
      setError(errorMessage(err, 'Could not run payroll.'))
    }
  }

  return (
    <div className="space-y-[18px]">
      <Card>
        <CardHeader>
          <CardTitle>Run payroll</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Field label="Month" htmlFor="pay_month">
                <Input id="pay_month" type="month" value={month} max={current} onChange={(e) => e.target.value && setMonth(e.target.value)} />
              </Field>
            </div>
            <Button onClick={() => void onRun()} loading={runPayroll.isPending} disabled={finalized || month > current}>
              <Calculator className="size-4" aria-hidden />
              {finalized ? `${monthLabel(month)} is finalized` : existing ? `Recount the ${monthLabel(month)} draft` : `Run payroll for ${monthLabel(month)}`}
            </Button>
          </div>
          <FormError message={error} />
          <InfoBanner>
            Builds a draft from salaries, attendance and unpaid leave, after counting the month’s attendance again. Review it, set adjustments for anyone who
            joined or left mid-month, then finalize. {month === current && 'This month hasn’t ended yet, so only the days so far are counted.'}
          </InfoBanner>
        </CardContent>
      </Card>

      <Card>
        {runs.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : runs.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load payroll runs.</p>
        ) : !runs.data?.length ? (
          <EmptyState icon={Wallet} title="No payroll runs yet" hint="Pick a month above and run payroll to build the first draft." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th>Status</Th>
                <Th className="text-right">People</Th>
                <Th className="text-right">Net pay</Th>
                <Th>Last change</Th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr
                  key={r.id}
                  data-run={r.month}
                  onClick={() => navigate(`/finance/payroll/${r.id}`)}
                  className="cursor-pointer"
                >
                  <Td className="font-medium">{monthLabel(r.month)}</Td>
                  <Td>
                    <RunStatusBadge status={r.status} />
                  </Td>
                  {r.people === 0 && r.net === 0 ? (
                    // An empty draft: say why instead of a bare "PKR 0".
                    <Td colSpan={2} className="text-right text-[13px] text-ink-500">
                      No salaries in this draft yet - set them under Salaries, then recount.
                    </Td>
                  ) : (
                    <>
                      <Td className="text-right tabular-nums">{r.people}</Td>
                      <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPkr(r.net)}</Td>
                    </>
                  )}
                  <Td>{formatDate(r.updated.replace(' ', 'T'), tz)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
