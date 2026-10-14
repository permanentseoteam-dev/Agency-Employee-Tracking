import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { formatDate } from '@/lib/dates'
import { formatDuration } from '@/lib/format'
import { totalsByDay, weekOf, type LiveStatus } from '@/lib/tracking'
import { cn } from '@/lib/cn'
import { todayKey, useMyWeek, useTimezone, useTrackerStatus, type TrackerStatus } from './api'
import { StatusBadge } from './StatusBadge'

const REASON: Record<TrackerStatus['reason'], string> = {
  tracking: '',
  starting: 'Starting…',
  outside_shift: 'Outside shift hours – nothing is being recorded.',
  locked: 'Paused while the screen is locked.',
  suspended: 'Paused while the PC sleeps.',
  no_consent: 'Waiting for the tracking notice.',
  no_user: 'Not signed in.'
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-sm text-slate-500">{label}</div>
      <div className={cn('mt-1 text-3xl font-semibold tabular-nums', className)}>{value}</div>
    </div>
  )
}

export function MyStats() {
  const tz = useTimezone()
  const status = useTrackerStatus()
  const today = todayKey(tz)
  const days = weekOf(today)
  const week = useMyWeek(days[0])

  const byDay = useMemo(() => {
    const t = totalsByDay(week.data ?? [], tz)
    // Today comes from the tracker itself: it includes the open segment and anything not yet synced.
    if (status && status.today.date === today) t[today] = { active_s: status.today.active_s, idle_s: status.today.idle_s }
    return t
  }, [week.data, status, today, tz])

  const weekTotal = days.reduce(
    (sum, d) => ({ active_s: sum.active_s + (byDay[d]?.active_s ?? 0), idle_s: sum.idle_s + (byDay[d]?.idle_s ?? 0) }),
    { active_s: 0, idle_s: 0 }
  )
  const live: LiveStatus = status?.state === 'active' ? 'active' : status?.state === 'idle' ? 'idle' : 'offline'
  const note = status && !status.signedIn ? 'Signed out – your time is saved and syncs after you sign in.' : status ? REASON[status.reason] : ''

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Today</CardTitle>
          <StatusBadge status={live} />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Stat label="Active" value={formatDuration(byDay[today]?.active_s ?? 0)} className="text-emerald-700 dark:text-emerald-400" />
          <Stat label="Idle" value={formatDuration(byDay[today]?.idle_s ?? 0)} className="text-amber-700 dark:text-amber-400" />
          <div className="col-span-2 self-end text-sm text-slate-500 sm:col-span-1">
            {note}
            {status && status.pending > 0 && (
              <span className="block">
                {status.pending} segment{status.pending === 1 ? '' : 's'} waiting to sync
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
        </CardHeader>
        {week.isError ? (
          <p className="p-5 text-sm text-red-600">Could not load this week.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Day</Th>
                <Th className="text-right">Active</Th>
                <Th className="text-right">Idle</Th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d} className={d === today ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : undefined}>
                  <Td>
                    {new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z'))}{' '}
                    <span className="text-slate-500">{formatDate(d + 'T12:00:00Z', 'UTC')}</span>
                  </Td>
                  <Td className="text-right tabular-nums">{d > today ? '—' : formatDuration(byDay[d]?.active_s ?? 0)}</Td>
                  <Td className="text-right tabular-nums">{d > today ? '—' : formatDuration(byDay[d]?.idle_s ?? 0)}</Td>
                </tr>
              ))}
              <tr className="font-semibold">
                <Td>Week total</Td>
                <Td className="text-right tabular-nums" data-total="active">{formatDuration(weekTotal.active_s)}</Td>
                <Td className="text-right tabular-nums" data-total="idle">{formatDuration(weekTotal.idle_s)}</Td>
              </tr>
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
