import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { monthLabel } from '@/lib/attendance'
import { cn } from '@/lib/cn'
import { formatAdjustment, formatPkr } from '@/lib/payroll'
import { useSession } from '@/stores/session'
import { useMyPay, type MyPayLine } from './api'
import { LineDialog, Total } from './PayrollDetail'

/** A manager's or employee's own pay: read-only, finalized months only (the server hides drafts and other people). */
export function MyPay() {
  const user = useSession((s) => s.user)!
  const pay = useMyPay(user.id)
  const [open, setOpen] = useState<MyPayLine | null>(null)

  if (pay.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (pay.isError || !pay.data) return <p className="text-sm text-red-600">Could not load your pay.</p>

  const { salary, lines } = pay.data
  const latest = lines[0]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Total label="Monthly salary" value={salary?.monthly_salary_pkr ? formatPkr(salary.monthly_salary_pkr) : 'Not set yet'} strong />
        <Total
          label={latest?.expand?.run ? `Net pay, ${monthLabel(latest.expand.run.month)}` : 'Latest net pay'}
          value={latest ? formatPkr(latest.net) : '—'}
          strong
        />
      </div>

      <Card>
        {lines.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No pay yet. Each month appears here once the admin finalizes payroll.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th className="text-right">Salary</Th>
                <Th className="text-right" title="Working days in the month">
                  Days
                </Th>
                <Th className="text-right">Absent</Th>
                <Th className="text-right">Unpaid leave</Th>
                <Th className="text-right">Half days</Th>
                <Th className="text-right">Deductions</Th>
                <Th className="text-right">Adjustment</Th>
                <Th className="text-right">Net pay</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((i) => (
                <tr
                  key={i.id}
                  data-pay-month={i.expand?.run?.month}
                  onClick={() => setOpen(i)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <Td className="font-medium">{i.expand?.run ? monthLabel(i.expand.run.month) : '—'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{formatPkr(i.base)}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{i.working_days}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{i.absent_days || '–'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{i.unpaid_leave_days || '–'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{i.half_days || '–'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{i.deductions ? formatPkr(-i.deductions) : '–'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums" title={i.note || undefined}>
                    {formatAdjustment(i.adjustment_pkr)}
                  </Td>
                  <Td className={cn('whitespace-nowrap text-right font-semibold tabular-nums', i.net < 0 && 'text-red-600')}>{formatPkr(i.net)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        Per-day rate = salary ÷ working days (weekends and holidays excluded). Deductions = (absent + unpaid leave + ½ × half days) × rate. Late
        days cost nothing: they give stars instead. Click a month for its breakdown. Only the admin can change pay; ask them about anything that looks wrong.
      </p>

      {open && <LineDialog line={open} month={open.expand?.run?.month ?? ''} editable={false} onClose={() => setOpen(null)} />}
    </div>
  )
}
