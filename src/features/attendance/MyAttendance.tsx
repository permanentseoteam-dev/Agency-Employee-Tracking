import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { useOrgSettings } from '@/features/rules/api'
import { COUNTED, STATUS_LABEL, countStatuses, employedOn, monthDays, monthOf } from '@/lib/attendance'
import { cn } from '@/lib/cn'
import { formatDayKey, formatTime, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { formatDuration } from '@/lib/format'
import { useSession } from '@/stores/session'
import { StarsCard } from '@/features/stars/StarsList'
import { useMonthAttendance } from './api'
import { MonthPicker } from './MonthPicker'
import { AttendanceBadge, STATUS_CLASS } from './status'

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
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} max={monthOf(today)} onChange={setMonth} />
        <div className="ml-auto flex flex-wrap gap-2" aria-label="Month totals">
          {COUNTED.map((s) => (
            <span key={s} className={cn('rounded-md px-2.5 py-1 text-sm', STATUS_CLASS[s])} data-count={s}>
              {STATUS_LABEL[s]} <span className="font-semibold tabular-nums">{counts[s]}</span>
            </span>
          ))}
        </div>
      </div>

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
      <p className="text-xs text-slate-500">
        Counted every night at 01:00 from your tracked time. Late means your first activity came after the shift start plus the
        grace period; Half day means less active time than the half-day minimum.
      </p>
    </div>
  )
}
