import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { addDays } from '@/lib/dates'
import { formatDuration } from '@/lib/format'
import { reportCsv, reportTotals, weekOf } from '@/lib/tracking'
import { errorMessage } from '@/stores/session'
import { todayKey, useMyTeams, usePeople, useReport, useTimezone, type ReportParams } from './api'

const PERIOD_LABEL: Record<ReportParams['group'], string> = { day: 'Day', week: 'Week of', month: 'Month' }

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Reports() {
  const tz = useTimezone()
  const today = todayKey(tz)
  const [params, setParams] = useState<ReportParams>(() => ({ from: weekOf(today)[0], to: today, group: 'day', team: '', user: '' }))
  const teams = useMyTeams()
  const people = usePeople()
  const report = useReport(params)
  const set = (patch: Partial<ReportParams>) => setParams((p) => ({ ...p, ...patch }))

  const presets: { label: string; from: string; to: string; group: ReportParams['group'] }[] = [
    { label: 'This week', from: weekOf(today)[0], to: today, group: 'day' },
    { label: 'Last 4 weeks', from: addDays(weekOf(today)[0], -21), to: today, group: 'week' },
    { label: 'This month', from: today.slice(0, 8) + '01', to: today, group: 'day' },
    { label: 'Last 6 months', from: addDays(today, -183).slice(0, 8) + '01', to: today, group: 'month' }
  ]

  const employees = useMemo(
    () => (people.data ?? []).filter((p) => !params.team || p.team === params.team),
    [people.data, params.team]
  )
  const rows = report.data?.rows ?? []
  const totals = reportTotals(rows)
  const badRange = params.to < params.from

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p.label} variant="secondary" size="sm" onClick={() => set({ from: p.from, to: p.to, group: p.group })}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label="From" htmlFor="from">
            <Input id="from" type="date" value={params.from} max={params.to} onChange={(e) => e.target.value && set({ from: e.target.value })} />
          </Field>
          <Field label="To" htmlFor="to" error={badRange ? 'Must be on or after From.' : undefined}>
            <Input id="to" type="date" value={params.to} min={params.from} onChange={(e) => e.target.value && set({ to: e.target.value })} />
          </Field>
          <Field label="Group by" htmlFor="group">
            <Select id="group" value={params.group} onChange={(e) => set({ group: e.target.value as ReportParams['group'] })}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </Select>
          </Field>
          <Field label="Team" htmlFor="team">
            <Select id="team" value={params.team} onChange={(e) => set({ team: e.target.value, user: '' })}>
              <option value="">All teams</option>
              {teams.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Employee" htmlFor="employee">
            <Select id="employee" value={params.user} onChange={(e) => set({ user: e.target.value })}>
              <option value="">Everyone</option>
              {employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {rows.length} row{rows.length === 1 ? '' : 's'} · Total{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100" data-total="active">{formatDuration(totals.active_s)}</span> active,{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100" data-total="idle">{formatDuration(totals.idle_s)}</span> idle
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length === 0}
            onClick={() => download(`activity_${params.from}_to_${params.to}_by-${params.group}.csv`, reportCsv(rows, PERIOD_LABEL[params.group]))}
          >
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
        </div>
        {badRange ? null : report.isError ? (
          <p className="p-6 text-sm text-red-600">{errorMessage(report.error, 'Could not load the report.')}</p>
        ) : report.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No tracked time in this range.</p>
        ) : (
          <Table className={report.isFetching ? 'opacity-60' : undefined}>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Team</Th>
                <Th>{PERIOD_LABEL[params.group]}</Th>
                <Th className="text-right">Active</Th>
                <Th className="text-right">Idle</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.user}-${r.period}`} data-row>
                  <Td className="font-medium">{r.full_name}</Td>
                  <Td>{r.team || <span className="text-slate-400">—</span>}</Td>
                  <Td className="tabular-nums">{r.period}</Td>
                  <Td className="text-right tabular-nums">{formatDuration(r.active_s)}</Td>
                  <Td className="text-right tabular-nums">{formatDuration(r.idle_s)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
