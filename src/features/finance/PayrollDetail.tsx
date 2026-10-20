import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Lock, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { useTimezone } from '@/features/tracking/api'
import { monthLabel, monthOf } from '@/lib/attendance'
import { cn } from '@/lib/cn'
import { formatDate, formatDayKey, toDateKey } from '@/lib/dates'
import { breakdown, formatAdjustment, formatPay, formatPkr, isDayPay, midMonth, payrollCsv, runTotals } from '@/lib/payroll'
import { errorMessage } from '@/stores/session'
import { useDeleteRun, useFinalizeRun, usePayrollLines, usePayrollRun, useRunPayroll, useUpdateLine, type PayrollLine, type RunResult } from './api'
import { RunStatusBadge } from './PayrollRuns'

export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

export function PayrollDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const tz = useTimezone()
  const run = usePayrollRun(id)
  const lines = usePayrollLines(id)
  const recount = useRunPayroll()
  const finalize = useFinalizeRun()
  const remove = useDeleteRun()
  const [result, setResult] = useState<RunResult | null>((location.state as { result?: RunResult } | null)?.result ?? null)
  const [open, setOpen] = useState<PayrollLine | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (run.isLoading || lines.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (run.isError || !run.data) return <p className="text-sm text-red-600">This payroll run doesn’t exist.</p>

  const r = run.data
  const draft = r.status === 'draft'
  const items = lines.data ?? []
  const totals = runTotals(items)
  const current = monthOf(toDateKey(Date.now(), tz))
  const nameOf = (userId: string) => items.find((i) => i.user === userId)?.expand?.user?.full_name ?? userId
  // Runs counted with the day-pay rules show the daily rate and stars; older runs keep their half days.
  const dayPay = items.some(isDayPay)

  async function act(fn: () => Promise<unknown>, fallback: string) {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err, fallback))
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/finance/payroll" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="size-4" aria-hidden /> Payroll runs
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{monthLabel(r.month)} payroll</h2>
        <RunStatusBadge status={r.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => download(`payroll_${r.month}${draft ? '_draft' : ''}.csv`, payrollCsv(items, nameOf))}
            disabled={items.length === 0}
          >
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
          {draft && (
            <>
              <Button
                variant="secondary"
                loading={recount.isPending}
                onClick={() => void act(async () => setResult(await recount.mutateAsync(r.month)), 'Could not recount.')}
              >
                <RefreshCw className="size-4" aria-hidden /> Recount
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  window.confirm(`Delete the ${monthLabel(r.month)} draft? Adjustments and notes are lost.`) &&
                  void act(async () => {
                    await remove.mutateAsync(r.id)
                    navigate('/finance/payroll')
                  }, 'Could not delete the draft.')
                }
              >
                Delete draft
              </Button>
              <Button
                loading={finalize.isPending}
                disabled={items.length === 0}
                onClick={() =>
                  window.confirm(`Approve ${monthLabel(r.month)} payroll for ${items.length} people (${formatPay(totals.net)})? It can’t be changed afterwards.`) &&
                  void act(() => finalize.mutateAsync(r.id), 'Could not approve.')
                }
              >
                <Lock className="size-4" aria-hidden /> Approve
              </Button>
            </>
          )}
        </div>
      </div>

      <FormError message={error} />
      {!draft && (
        <p className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" data-locked>
          <Lock className="size-4 shrink-0" aria-hidden /> Approved on {formatDate(r.updated.replace(' ', 'T'), tz)}. This run is locked and can’t be changed.
        </p>
      )}
      {draft && r.month === current && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {monthLabel(r.month)} hasn’t ended
          {result?.counted_to ? `: attendance is counted up to ${formatDayKey(result.counted_to)}` : ''}. Recount after the month ends, before approving.
        </p>
      )}
      {result && result.skipped.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Left out because no salary is set: {result.skipped.join(', ')}.{' '}
          <Link to="/finance/salaries" className="font-medium underline">
            Set salaries
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 @2xl/page:grid-cols-3 @5xl/page:grid-cols-5">
        <Total label="People" value={String(items.length)} />
        <Total label="Salaries" value={formatPkr(totals.base)} />
        <Total label="Deductions" value={formatPay(-totals.deductions)} />
        <Total label="Adjustments" value={formatAdjustment(totals.adjustments)} />
        <Total label="Net pay" value={formatPay(totals.net)} strong />
      </div>

      <Card>
        {lines.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the lines.</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nobody to pay this month. Check that salaries are set.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="min-w-40">Employee</Th>
                <Th className="text-right">Salary</Th>
                <Th className="text-right" title="Working days in the month">
                  Days
                </Th>
                {dayPay && <Th className="text-right">Daily rate</Th>}
                <Th className="text-right">Absent</Th>
                <Th className="text-right">Unpaid leave</Th>
                {dayPay ? <Th className="text-right">Stars</Th> : <Th className="text-right">Half days</Th>}
                {dayPay && <Th className="text-right">Star deduction</Th>}
                <Th className="text-right">Deductions</Th>
                <Th className="text-right">Adjustment</Th>
                <Th className="text-right">Net pay</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const person = i.expand?.user
                const mid = person ? midMonth(person, r.month) : null
                return (
                  <tr
                    key={i.id}
                    data-line={i.user}
                    onClick={() => setOpen(i)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Td>
                      <span className="block font-medium wrap-anywhere text-slate-900 dark:text-slate-100">{person?.full_name ?? i.user}</span>
                      {mid && (
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          <Badge tone="blue">{mid === 'joined' ? `Joined ${formatDayKey(person!.joined_on)}` : `Left ${formatDayKey(person!.left_on)}`}</Badge>
                          {draft && !isDayPay(i) && !i.adjustment_pkr && <Badge tone="amber">Set an adjustment</Badge>}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{formatPkr(i.base)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{i.working_days}</Td>
                    {dayPay && <Td className="whitespace-nowrap text-right tabular-nums">{formatPay(breakdown(i).rate)}</Td>}
                    <Td className="whitespace-nowrap text-right tabular-nums">{i.absent_days || '–'}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{i.unpaid_leave_days || '–'}</Td>
                    {dayPay ? (
                      <Td className="whitespace-nowrap text-right tabular-nums">{i.stars || '–'}</Td>
                    ) : (
                      <Td className="whitespace-nowrap text-right tabular-nums">{i.half_days || '–'}</Td>
                    )}
                    {dayPay && (
                      <Td className="whitespace-nowrap text-right tabular-nums">{i.star_deduction_pkr ? formatPay(-i.star_deduction_pkr) : '–'}</Td>
                    )}
                    <Td className="whitespace-nowrap text-right tabular-nums">{i.deductions ? formatPay(-i.deductions) : '–'}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums" title={i.note || undefined}>
                      {formatAdjustment(i.adjustment_pkr)}
                    </Td>
                    <Td className={cn('whitespace-nowrap text-right font-semibold tabular-nums', i.net < 0 && 'text-red-600')} data-net={i.net}>
                      {formatPay(i.net)}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="max-w-4xl text-xs text-slate-500">
        {dayPay
          ? 'Daily rate = salary ÷ working days (weekends and holidays excluded). Each working day pays the daily rate minus its stars × the star value (never below 0); absent and unpaid days pay nothing. Net = the days’ pay + adjustment.'
          : 'Per-day rate = salary ÷ working days (weekends and holidays excluded). Deductions = (absent + unpaid leave + ½ × half days) × rate.'}{' '}
        Click a line for its breakdown{draft ? ' and to set an adjustment' : ''}.
      </p>

      {open && <LineDialog line={open} month={r.month} editable={draft} daily onClose={() => setOpen(null)} />}
    </div>
  )
}

export function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Card className="px-4 py-3">
      <div className="truncate text-xs text-slate-500">{label}</div>
      <div className={cn('mt-1 truncate tabular-nums', strong ? 'text-lg font-semibold' : 'font-medium')} data-total={label}>
        {value}
      </div>
    </Card>
  )
}

function Row({ label, detail, amount, strong }: { label: string; detail?: string; amount: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-1 text-sm', strong && 'border-t border-slate-200 pt-2 font-semibold dark:border-slate-800')}>
      <span className="min-w-0 wrap-anywhere">
        {label}
        {detail && <span className="ml-2 text-xs text-slate-500">{detail}</span>}
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{amount}</span>
    </div>
  )
}

export function LineDialog({
  line,
  month,
  editable,
  daily,
  onClose
}: {
  line: PayrollLine
  month: string
  editable: boolean
  /** Admins: link to the day-by-day view. */
  daily?: boolean
  onClose: () => void
}) {
  const update = useUpdateLine()
  const b = breakdown(line)
  const [adjustment, setAdjustment] = useState(String(line.adjustment_pkr || ''))
  const [note, setNote] = useState(line.note)
  const [error, setError] = useState<string | null>(null)
  const name = line.expand?.user?.full_name ?? line.user
  const adj = Number(adjustment.replace(/,/g, '').trim() || '0')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!Number.isInteger(adj)) return setError('Enter the adjustment in whole rupees, e.g. -20000 or 5000.')
    if (adj !== 0 && !note.trim()) return setError('Add a note saying why, e.g. “Left on the 18th”.')
    try {
      await update.mutateAsync({ id: line.id, adjustment: adj, note: note.trim() })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={`${name} · ${monthLabel(month)}`} className="max-w-lg">
      <div data-breakdown>
        <Row label="Monthly salary" amount={formatPkr(line.base)} />
        <Row label="Working days" detail={`daily rate ${formatPkr(b.rate, 2)}`} amount={line.working_days} />
        {isDayPay(line) && <Row label="Hourly rate" detail={`one star = ${formatPkr(line.star_value ?? 0, 2)}`} amount={formatPkr(line.hourly_rate ?? 0, 2)} />}
        {line.absent_days > 0 && <Row label="Absent" detail={days(line.absent_days)} amount={formatPkr(-b.absent, 2)} />}
        {line.unpaid_leave_days > 0 && <Row label="Unpaid leave" detail={days(line.unpaid_leave_days)} amount={formatPkr(-b.unpaidLeave, 2)} />}
        {line.half_days > 0 && <Row label="Half days" detail={`${line.half_days} × ½ day`} amount={formatPkr(-b.halfDays, 2)} />}
        {(line.stars ?? 0) > 0 && isDayPay(line) && (
          <Row
            label="Stars"
            detail={`${line.late_stars ?? 0} late + ${line.shortfall_stars ?? 0} short + ${line.hand_stars ?? 0} by hand`}
            amount={formatPkr(-b.stars, 2)}
          />
        )}
        {b.other > 0 && <Row label="Other" detail={isDayPay(line) ? 'days before joining or after leaving' : 'under earlier pay rules'} amount={formatPkr(-b.other)} />}
        <Row label="Deductions" amount={formatPay(-line.deductions)} strong />
        {!editable && <Row label="Adjustment" detail={line.note} amount={formatAdjustment(line.adjustment_pkr)} />}
        {editable ? (
          <Row label="Net pay" detail="with the adjustment below" amount={Number.isInteger(adj) ? formatPay(line.base - line.deductions + adj) : '—'} strong />
        ) : (
          <Row label="Net pay" amount={formatPay(line.net)} strong />
        )}
      </div>
      {daily && isDayPay(line) && (
        <Link to={`/finance/daily?month=${month}&user=${line.user}`} className="mt-2 inline-block text-sm font-medium text-indigo-700 hover:underline">
          See it day by day
        </Link>
      )}

      {editable ? (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Adjustment (PKR)" htmlFor="adj" hint="Minus to deduct, plus to add.">
              <Input id="adj" inputMode="numeric" value={adjustment} placeholder="0" onChange={(e) => setAdjustment(e.target.value)} autoFocus />
            </Field>
            <Field label="Note" htmlFor="adj_note">
              <Input id="adj_note" value={note} maxLength={500} placeholder="e.g. Left on the 18th" onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={update.isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </Dialog>
  )
}
