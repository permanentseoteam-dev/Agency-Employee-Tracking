import { useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/Card'
import { StatCard, StatGrid } from '@/components/ui/StatCard'
import { Table, Td, Th } from '@/components/ui/Table'
import { TrendChart } from '@/components/ui/TrendChart'
import { useMonthAttendance } from '@/features/attendance/api'
import { AttendanceBadge } from '@/features/attendance/status'
import { monthOf } from '@/lib/attendance'
import { addDays, formatTime } from '@/lib/dates'
import { formatDuration, formatSignedDuration } from '@/lib/format'
import { monthWeeks, sumDays, totalsByDay, weekOf, type LiveStatus } from '@/lib/tracking'
import { useSession } from '@/stores/session'
import { todayKey, useMySegments, useTimezone, useTrackerStatus, type TrackerStatus } from './api'
import { StatusBadge } from './StatusBadge'

const REASON: Record<TrackerStatus['reason'], string> = {
  tracking: '',
  starting: 'Starting…',
  outside_shift: 'Outside shift hours - nothing is being recorded.',
  locked: 'Paused while the screen is locked.',
  suspended: 'Paused while the PC sleeps.',
  no_consent: 'Waiting for the tracking notice.',
  no_user: 'Not signed in.'
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const DAY_ROW = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const at = (d: string) => new Date(d + 'T12:00:00Z')

/** "5 to 11 Oct", or "1 Oct" for a one-day week. */
function weekLabel(from: string, to: string): string {
  return from === to ? DAY_MONTH.format(at(from)) : `${DAY.format(at(from))} to ${DAY_MONTH.format(at(to))}`
}

/** Share of a total for the progress bars, 0 when there is nothing yet. */
const share = (part: number, total: number) => (total > 0 ? Math.max(0, part) / total : 0)

export function MyStats() {
  const tz = useTimezone()
  const status = useTrackerStatus()
  const user = useSession((s) => s.user)!
  const today = todayKey(tz)
  const days = weekOf(today)
  const weeks = monthWeeks(today)
  const monthStart = weeks[0].from
  // One query covers both cards: from this week's Monday or the 1st, whichever is earlier.
  const week = useMySegments(days[0] < monthStart ? days[0] : monthStart)
  // The attendance log: this week's days can fall in two months (same month = one query).
  const attFirst = useMonthAttendance(monthOf(days[0]), user.id)
  const attLast = useMonthAttendance(monthOf(days[6]), user.id)
  const records = useMemo(
    () => new Map([...(attFirst.data ?? []), ...(attLast.data ?? [])].map((r) => [r.date, r])),
    [attFirst.data, attLast.data]
  )

  const byDay = useMemo(() => {
    const t = totalsByDay(week.data ?? [], tz)
    // Today comes from the tracker itself: it includes the open segment and anything not yet synced.
    if (status && status.today.date === today) t[today] = { active_s: status.today.active_s, idle_s: status.today.idle_s }
    return t
  }, [week.data, status, today, tz])

  const weekTotal = sumDays(byDay, days[0], days[6])
  const monthTotal = sumDays(byDay, monthStart, today)
  let daysWorked = 0
  for (let d = monthStart; d <= today; d = addDays(d, 1)) if ((byDay[d]?.active_s ?? 0) > 0) daysWorked++
  const live: LiveStatus = status?.state === 'active' ? 'active' : status?.state === 'idle' ? 'idle' : 'offline'
  const note = status && !status.signedIn ? 'Signed out - your time is saved and syncs after you sign in.' : status ? REASON[status.reason] : ''

  const todayActive = byDay[today]?.active_s ?? 0
  const todayIdle = byDay[today]?.idle_s ?? 0
  const todayTracked = todayActive + todayIdle
  // Net = active − idle, in the whole minutes shown above, so it always matches the two figures.
  const todayNet = (Math.floor(todayActive / 60) - Math.floor(todayIdle / 60)) * 60
  const time = (value: string | undefined) => (value ? formatTime(value.replace(' ', 'T'), tz) : '-')
  const log = days.filter((d) => d <= today).reverse()

  return (
    <div className="mx-auto max-w-7xl space-y-[18px]">
      <StatGrid>
        <StatCard label="Active today" value={formatDuration(todayActive)} tone="success" progress={share(todayActive, todayTracked)} />
        <StatCard label="Idle today" value={formatDuration(todayIdle)} tone="warning" progress={share(todayIdle, todayTracked)} />
        <StatCard
          label="Net today"
          value={<span className={todayNet < 0 ? 'text-[var(--danger-text)]' : undefined}>{formatSignedDuration(todayNet)}</span>}
          tone="brand"
          progress={share(todayNet, todayTracked)}
        />
        <StatCard
          label="Week active"
          value={formatDuration(weekTotal.active_s)}
          valueProps={{ 'data-total': 'active' }}
          tone="navy"
          progress={share(weekTotal.active_s, weekTotal.active_s + weekTotal.idle_s)}
        >
          <span className="text-[12.5px] text-ink-500">
            Idle this week{' '}
            <span className="tabular-nums" data-total="idle">
              {formatDuration(weekTotal.idle_s)}
            </span>
          </span>
        </StatCard>
      </StatGrid>

      {(note || (status && status.pending > 0)) && (
        <p className="px-1 text-[13px] text-ink-500">
          {note}
          {status && status.pending > 0 && (
            <span className="block">
              {status.pending} segment{status.pending === 1 ? '' : 's'} waiting to sync
            </span>
          )}
        </p>
      )}

      {week.isError ? (
        <Card className="p-6 text-sm text-[var(--danger-text)]">Could not load this week.</Card>
      ) : (
        <TrendChart
          title="Activity trend"
          subtitle={`Active vs idle, ${weekLabel(days[0], days[6])}`}
          points={days.map((d) => ({
            label: WEEKDAY.format(at(d)),
            active_s: d > today ? 0 : (byDay[d]?.active_s ?? 0),
            idle_s: d > today ? 0 : (byDay[d]?.idle_s ?? 0),
            today: d === today
          }))}
        />
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Attendance log</CardTitle>
          <StatusBadge status={live} />
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Day</Th>
              <Th>Status</Th>
              <Th>First</Th>
              <Th>Last</Th>
              <Th className="text-right">Active</Th>
              <Th className="text-right">Idle</Th>
            </tr>
          </thead>
          <tbody>
            {log.map((d) => {
              const r = records.get(d)
              const active = byDay[d]?.active_s ?? 0
              const idle = byDay[d]?.idle_s ?? 0
              return (
                <tr key={d} data-log-day={d}>
                  <Td className="font-semibold whitespace-nowrap">{DAY_ROW.format(at(d)).replace(',', '')}</Td>
                  <Td>
                    {r ? (
                      <AttendanceBadge status={r.status} />
                    ) : d === today ? (
                      <Badge tone="blue">Counted tonight</Badge>
                    ) : (
                      <span className="text-ink-400">Not counted yet</span>
                    )}
                  </Td>
                  <Td className={r?.first_activity_at ? 'whitespace-nowrap' : 'whitespace-nowrap text-ink-400'}>{time(r?.first_activity_at)}</Td>
                  <Td className={r?.last_activity_at ? 'whitespace-nowrap' : 'whitespace-nowrap text-ink-400'}>{time(r?.last_activity_at)}</Td>
                  <Td className={active ? 'text-right font-semibold whitespace-nowrap' : 'text-right whitespace-nowrap text-ink-400'}>{formatDuration(active)}</Td>
                  <Td className={idle ? 'text-right whitespace-nowrap' : 'text-right whitespace-nowrap text-ink-400'}>{formatDuration(idle)}</Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This month</CardTitle>
          <CardSubtitle>{MONTH.format(at(today))}</CardSubtitle>
        </CardHeader>
        {week.isError ? (
          <p className="px-6 pb-6 text-sm text-[var(--danger-text)]">Could not load this month.</p>
        ) : (
          <>
            <StatGrid className="px-6 pb-2">
              <StatCard label="Active" value={formatDuration(monthTotal.active_s)} tone="success" />
              <StatCard label="Idle" value={formatDuration(monthTotal.idle_s)} tone="warning" />
              <StatCard label="Days with activity" value={String(daysWorked)} tone="brand" />
            </StatGrid>
            <Table>
              <thead>
                <tr>
                  <Th>Week</Th>
                  <Th className="text-right">Active</Th>
                  <Th className="text-right">Idle</Th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => {
                  const total = sumDays(byDay, w.from, w.to)
                  return (
                    <tr key={w.from} className={w.from <= today && today <= w.to ? 'bg-indigo-500/[.05]' : undefined}>
                      <Td className="font-semibold whitespace-nowrap">{weekLabel(w.from, w.to)}</Td>
                      <Td className="text-right">{w.from > today ? '-' : formatDuration(total.active_s)}</Td>
                      <Td className="text-right">{w.from > today ? '-' : formatDuration(total.idle_s)}</Td>
                    </tr>
                  )
                })}
                <tr className="font-semibold">
                  <Td>Month total</Td>
                  <Td className="text-right" data-month-total="active">
                    {formatDuration(monthTotal.active_s)}
                  </Td>
                  <Td className="text-right" data-month-total="idle">
                    {formatDuration(monthTotal.idle_s)}
                  </Td>
                </tr>
              </tbody>
            </Table>
          </>
        )}
      </Card>
    </div>
  )
}
