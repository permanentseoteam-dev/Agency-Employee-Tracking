import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { useOrgSettings } from '@/features/rules/api'
import { COUNTED, STATUS_LABEL, countStatuses, employedOn, monthDays, monthOf } from '@/lib/attendance'
import { InfoBanner } from '@/components/ui/InfoBanner'
import { StatCard, StatGrid, type StatTone } from '@/components/ui/StatCard'
import { formatDayKey, formatTime, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { formatDuration } from '@/lib/format'
import { useSession } from '@/stores/session'
import { StarsCard } from '@/features/stars/StarsList'
import { useMonthAttendance } from './api'
import { MonthPicker } from './MonthPicker'
import { AttendanceBadge } from './status'

const STATUS_TONE: Partial<Record<string, StatTone>> = {
  present: 'success',
  late: 'warning',
  half_day: 'orange',
  absent: 'danger',
  on_leave: 'info'
}

export function MyAttendance() {
  const user = useSession((s) => s.user)!
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const today = toDateKey(Date.now(), tz)
  const [month, setMonth] = useState(() => monthOf(today))
  const records = useMonthAttendance(month, user.id)

  const byDay = useMemo(() => new Map((records.data ?? []).map((r) => [r.date, r])), [records.data])
  const counts = countStatuses(records.data ?? [])
  // Newest first, up to today, only while employed.
  const days = monthDays(month)
    .filter((d) => d <= today && employedOn(d, user))
    .reverse()
  const time = (value: string) => (value ? formatTime(value.replace(' ', 'T'), tz) : '—')

  return (
    <div className="mx-auto max-w-5xl space-y-[18px]">
      <MonthPicker month={month} max={monthOf(today)} onChange={setMonth} />
      <StatGrid aria-label="Month totals" className="grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {COUNTED.map((s) => (
          <div key={s} data-count={s}>
            <StatCard label={STATUS_LABEL[s]} value={counts[s]} tone={STATUS_TONE[s] ?? 'neutral'} className="h-full" />
          </div>
        ))}
      </StatGrid>

      <Card>
        {records.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : records.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load your attendance.</p>
        ) : days.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nothing for this month.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Day</Th>
                <Th>Status</Th>
                <Th>First activity</Th>
                <Th>Last activity</Th>
                <Th className="text-right">Active</Th>
                <Th className="text-right">Idle</Th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const r = byDay.get(d)
                return (
                  <tr key={d} data-day={d} data-status={r?.status ?? ''}>
                    <Td className="tabular-nums">{formatDayKey(d)}</Td>
                    {r ? (
                      <>
                        <Td>
                          <AttendanceBadge status={r.status} />
                        </Td>
                        <Td className="tabular-nums">{time(r.first_activity_at)}</Td>
                        <Td className="tabular-nums">{time(r.last_activity_at)}</Td>
                        <Td className="text-right tabular-nums">{formatDuration(r.active_s)}</Td>
                        <Td className="text-right tabular-nums">{formatDuration(r.idle_s)}</Td>
                      </>
                    ) : (
                      <Td colSpan={5} className="text-slate-400">
                        {d === today ? 'Counted tonight' : 'Not counted yet'}
                      </Td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <StarsCard userId={user.id} month={month} attendance={records.data ?? []} />
      <InfoBanner>
        Counted every night at 01:00 from your tracked time. Late means your first activity came after the shift start plus the
        grace period; Half day means less active time than the half-day minimum.
      </InfoBanner>
    </div>
  )
}
