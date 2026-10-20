import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { useMonthAttendance } from '@/features/attendance/api'
import { MonthPicker } from '@/features/attendance/MonthPicker'
import { useHolidays } from '@/features/calendar/api'
import type { Employee, Salary } from '@/features/org/api'
import { useOrgSettings } from '@/features/rules/api'
import { useStarRecords, useStarRules } from '@/features/stars/api'
import { useTimezone } from '@/features/tracking/api'
import { monthLabel, monthOf, STATUS_LABEL, type AttendanceStatus } from '@/lib/attendance'
import { toCsv } from '@/lib/csv'
import { formatDayKey, formatTime, toDateKey } from '@/lib/dates'
import { formatDuration } from '@/lib/format'
import { calculateMonth, type DayLine } from '@/lib/pay'
import { formatPay, formatPkr, isDayPay } from '@/lib/payroll'
import { recordsByDay } from '@/lib/stars'
import { errorMessage } from '@/stores/session'
import { useFinalizeRun, usePayrollLines, usePayrollRuns, useSalaryTable } from './api'
import { download, Total } from './PayrollDetail'

/** Finance → Daily pay: one person's month day by day, the way payroll counts it. Admins only. */
export function DailyBreakdown() {
  const tz = useTimezone()
  const current = monthOf(toDateKey(Date.now(), tz))
  const [params, setParams] = useSearchParams()
  const people = useSalaryTable()
  const month = params.get('month') || current
  const userId = params.get('user') || people.data?.find((p) => p.person.active && p.salary?.monthly_salary_pkr)?.person.id || ''
  const chosen = people.data?.find((p) => p.person.id === userId)
  const pick = (patch: { month?: string; user?: string }) => setParams({ month, user: userId, ...patch }, { replace: true })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} max={current} onChange={(m) => pick({ month: m })} />
        <select
          aria-label="Employee"
          value={userId}
          onChange={(e) => pick({ user: e.target.value })}
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {(people.data ?? []).map((p) => (
            <option key={p.person.id} value={p.person.id}>
              {p.person.full_name}
              {p.person.active ? '' : ' (left)'}
            </option>
          ))}
        </select>
      </div>
      {people.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !chosen ? (
        <p className="text-sm text-slate-500">Pick someone.</p>
      ) : (
        <PersonMonth key={`${userId}|${month}`} person={chosen.person} salary={chosen.salary} month={month} tz={tz} admin />
      )}
    </div>
  )
}

/** One person's month day by day. admin: the Approve button; otherwise it is the person's own read-only view (My pay). */
export function PersonMonth({ person, salary, month, tz, admin }: { person: Employee; salary: Salary | null; month: string; tz: string; admin?: boolean }) {
  const settings = useOrgSettings()
  const holidays = useHolidays()
  const attendance = useMonthAttendance(month, person.id)
  const rules = useStarRules()
  const starRecords = useStarRecords(month, person.id)
  const runs = usePayrollRuns()
  const run = runs.data?.find((r) => r.month === month)
  const lines = usePayrollLines(run?.id ?? '')
  const finalize = useFinalizeRun()
  const [error, setError] = useState<string | null>(null)

  if (settings.isLoading || attendance.isLoading || rules.isLoading || starRecords.isLoading || runs.isLoading || holidays.isLoading) {
    return <p className="text-sm text-slate-500">Loading…</p>
  }
  if (!settings.data) return <p className="text-sm text-red-600">Could not load the rules.</p>

  const line = lines.data?.find((l) => l.user === person.id)
  const approved = run?.status === 'finalized'
  if (approved && line && !isDayPay(line)) {
    return <p className="text-sm text-slate-500">{monthLabel(month)} was approved under the earlier pay rules (before stars cost pay). Its figures are in Payroll.</p>
  }
  // An approved month is paid on the salary it was approved with.
  const base = approved && line ? line.base : (salary?.monthly_salary_pkr ?? 0)
  const records = attendance.data ?? []
  const byDate = new Map(records.map((r) => [r.date, r]))
  const m = calculateMonth({
    month,
    salary: base,
    adjustment: line?.adjustment_pkr ?? 0,
    settings: settings.data,
    holidays: holidays.data ?? [],
    person,
    records,
    stars: recordsByDay(rules.data ?? [], starRecords.data ?? [])
  })

  const statusOf = (d: DayLine) => (!d.employed ? 'Not employed' : !d.counted ? 'Not counted yet' : STATUS_LABEL[d.status as AttendanceStatus] ?? d.status)
  const loginOf = (date: string) => {
    const at = byDate.get(date)?.first_activity_at
    return at ? formatTime(at.replace(' ', 'T'), tz) : ''
  }

  function exportCsv() {
    const rows = m.days.map((d) => [
      d.date,
      statusOf(d),
      loginOf(d.date),
      ((byDate.get(d.date)?.active_s ?? 0) / 3600).toFixed(2),
      String(d.late_stars),
      String(d.shortfall_stars),
      String(d.hand_stars),
      d.deduction.toFixed(2),
      d.day_pay.toFixed(2)
    ])
    rows.push(['Total', '', '', '', String(m.late_stars), String(m.shortfall_stars), String(m.hand_stars), m.star_deduction.toFixed(2), m.gross.toFixed(2)])
    const header = ['Date', 'Status', 'Login', 'Active hours', 'Late stars', 'Short stars', 'Hand stars', 'Deduction', 'Day pay']
    download(`daily_pay_${month}_${person.full_name.replace(/\W+/g, '_')}.csv`, toCsv([header, ...rows]))
  }

  async function approve() {
    if (!run) return
    if (!window.confirm(`Approve ${monthLabel(month)} payroll for everyone? It can’t be changed afterwards.`)) return
    setError(null)
    try {
      await finalize.mutateAsync(run.id)
    } catch (err) {
      setError(errorMessage(err, 'Could not approve.'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={exportCsv}>
          <Download className="size-4" aria-hidden /> Export CSV
        </Button>
        {!admin ? null : !run ? (
          <Link to="/finance/payroll" className="text-sm font-medium text-indigo-700 hover:underline">
            Run payroll for {monthLabel(month)} to approve it
          </Link>
        ) : approved ? (
          <span className="flex items-center gap-1.5 text-sm text-emerald-700">
            <Lock className="size-4" aria-hidden /> {monthLabel(month)} payroll is approved
          </span>
        ) : (
          <Button loading={finalize.isPending} onClick={() => void approve()}>
            <Lock className="size-4" aria-hidden /> Approve payroll
          </Button>
        )}
      </div>
      <FormError message={error} />

      <div className="grid grid-cols-2 gap-3 @2xl/page:grid-cols-3 @5xl/page:grid-cols-6">
        <Total label="Working days" value={String(m.working_days)} />
        <Total label="Daily rate" value={formatPkr(m.daily_rate, 2)} />
        <Total label="One star" value={formatPkr(m.star_value, 2)} />
        <Total label="Stars" value={`${m.stars} (${m.late_stars} late · ${m.shortfall_stars} short · ${m.hand_stars} by hand)`} />
        <Total label="Star deduction" value={formatPay(-m.star_deduction)} />
        <Total label={approved ? 'Net pay' : 'Projected net pay'} value={formatPay(m.net)} strong />
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th>Login</Th>
              <Th className="text-right">Active</Th>
              <Th className="text-right">Late ★</Th>
              <Th className="text-right">Short ★</Th>
              <Th className="text-right">Hand ★</Th>
              <Th className="text-right">Deduction</Th>
              <Th className="text-right">Day pay</Th>
            </tr>
          </thead>
          <tbody>
            {m.days.map((d) => {
              const rec = byDate.get(d.date)
              return (
                <tr key={d.date} data-day={d.date}>
                  <Td className="whitespace-nowrap">{formatDayKey(d.date)}</Td>
                  <Td className="whitespace-nowrap">{statusOf(d)}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{loginOf(d.date) || '–'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{rec?.active_s ? formatDuration(rec.active_s) : '–'}</Td>
                  <Td className="text-right tabular-nums">{d.late_stars || '–'}</Td>
                  <Td className="text-right tabular-nums">{d.shortfall_stars || '–'}</Td>
                  <Td className="text-right tabular-nums">{d.hand_stars || '–'}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{d.deduction ? formatPay(-d.deduction) : '–'}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatPay(d.day_pay)}</Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>
      <p className="max-w-4xl text-xs text-slate-500">
        Weekends and holidays aren’t working days, so they aren’t listed. Days not counted yet show full pay, so the projection assumes they are on time
        and long enough.{' '}
        {admin ? `This is worked out from attendance as it is now; the payroll run stores it when you run or recount ${monthLabel(month)}.` : 'Your final pay appears above once the month is approved.'}
        {m.hand_stars > m.days.reduce((s, d) => s + d.hand_stars, 0) && ' Stars given by hand on a day off come off the month total.'}
      </p>
    </div>
  )
}
