import { useMemo, useState } from 'react'
import { RefreshCw, Star } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { useHolidays } from '@/features/calendar/api'
import { useOrgSettings } from '@/features/rules/api'
import { useStarRecords, useStarRules } from '@/features/stars/api'
import { StarsDialog } from '@/features/stars/StarsList'
import { useRole } from '@/hooks/useRole'
import {
  COUNTED,
  STATUS_CODE,
  STATUS_LABEL,
  countStatuses,
  employedOn,
  monthDays,
  monthOf,
  recomputeRange,
  type AttendanceRecord
} from '@/lib/attendance'
import { cn } from '@/lib/cn'
import { formatDayKey, formatTime, isoWeekday, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { formatDuration } from '@/lib/format'
import { starLines, starsByUser } from '@/lib/stars'
import { errorMessage } from '@/stores/session'
import { useAttendancePeople, useMonthAttendance, useRecompute } from './api'
import { MonthPicker } from './MonthPicker'
import { STATUS_CLASS } from './status'

const WEEKDAY_LETTER = ['', 'M', 'T', 'W', 'T', 'F', 'S', 'S']

function cellTitle(day: string, r: AttendanceRecord, tz: string): string {
  const parts = [formatDayKey(day), STATUS_LABEL[r.status]]
  if (r.first_activity_at) parts.push(`first activity ${formatTime(r.first_activity_at.replace(' ', 'T'), tz)}`)
  if (r.active_s > 0) parts.push(`${formatDuration(r.active_s)} active`)
  return parts.join(' · ')
}

export function AttendanceTable() {
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const workDays = settings.data?.work_days ?? [1, 2, 3, 4, 5]
  const today = toDateKey(Date.now(), tz)
  const [month, setMonth] = useState(() => monthOf(today))
  const [team, setTeam] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [starsFor, setStarsFor] = useState<string | null>(null)

  const people = useAttendancePeople(month)
  const records = useMonthAttendance(month)
  const holidays = useHolidays()
  const recompute = useRecompute()
  const starRules = useStarRules()
  const starRecords = useStarRecords(month)
  const days = monthDays(month)
  const range = recomputeRange(month, today)

  const holidayName = useMemo(() => new Map((holidays.data ?? []).map((h) => [h.date, h.name])), [holidays.data])
  const byPerson = useMemo(() => {
    const map = new Map<string, Map<string, AttendanceRecord>>()
    for (const r of records.data ?? []) {
      if (!map.has(r.user)) map.set(r.user, new Map())
      map.get(r.user)!.set(r.date, r)
    }
    return map
  }, [records.data])

  const stars = useMemo(
    () => starsByUser(starLines(records.data ?? [], starRules.data ?? [], starRecords.data ?? [])),
    [records.data, starRules.data, starRecords.data]
  )
  const starsAvailable = !!starRules.data && !!starRecords.data

  const teams = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of people.data ?? []) if (p.expand?.team) map.set(p.expand.team.id, p.expand.team.name)
    return [...map].sort((a, b) => a[1].localeCompare(b[1]))
  }, [people.data])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (people.data ?? []).filter((p) => (!team || p.team === team) && (!q || p.full_name.toLowerCase().includes(q)))
  }, [people.data, team, search])

  async function onRecompute() {
    if (!range) return
    setNotice(null)
    try {
      const r = await recompute.mutateAsync(range)
      setNotice({ ok: true, text: `Recounted ${formatDayKey(r.from)} – ${formatDayKey(r.to)}: ${r.records} records.` })
    } catch (err) {
      setNotice({ ok: false, text: errorMessage(err, 'Could not recompute attendance.') })
    }
  }

  const loading = people.isLoading || records.isLoading
  const failed = people.isError || records.isError

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} max={monthOf(today)} onChange={setMonth} />
        <Input aria-label="Search people" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        {teams.length > 1 && (
          <Select aria-label="Filter by team" value={team} onChange={(e) => setTeam(e.target.value)} className="w-44">
            <option value="">All teams</option>
            {teams.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        )}
        {isAdmin && (
          <Button
            variant="secondary"
            className="ml-auto"
            disabled={!range}
            loading={recompute.isPending}
            onClick={() => void onRecompute()}
            title={range ? 'Count these days again, e.g. after adding a holiday' : 'No finished days in this month yet'}
          >
            <RefreshCw className="size-4" aria-hidden /> Recompute
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className={cn('text-sm', notice.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600')}>
          {notice.text}
        </p>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading attendance…</p>
        ) : failed ? (
          <p className="p-6 text-sm text-red-600">Could not load attendance.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {(people.data?.length ?? 0) === 0 ? 'Nobody to show. People appear here once they are in a team you manage.' : 'Nobody matches these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs" aria-label="Attendance grid">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-44 border-b border-slate-200 bg-white px-3 py-2 text-left font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                    Employee
                  </th>
                  {days.map((d) => {
                    const off = !workDays.includes(isoWeekday(d)) || holidayName.has(d)
                    return (
                      <th
                        key={d}
                        title={holidayName.get(d) ?? formatDayKey(d)}
                        className={cn(
                          'w-7 min-w-7 border-b border-slate-200 py-1 text-center font-normal text-slate-500 dark:border-slate-800',
                          off && 'bg-slate-50 dark:bg-slate-800/40',
                          d === today && 'text-indigo-700 dark:text-indigo-300'
                        )}
                      >
                        <span className="block">{WEEKDAY_LETTER[isoWeekday(d)]}</span>
                        <span className={cn('block font-semibold', d === today && 'underline')}>{Number(d.slice(8))}</span>
                      </th>
                    )
                  })}
                  {COUNTED.map((s) => (
                    <th key={s} title={STATUS_LABEL[s]} className="w-9 min-w-9 border-b border-l border-slate-200 py-1 text-center font-semibold text-slate-500 dark:border-slate-800">
                      {STATUS_CODE[s]}
                    </th>
                  ))}
                  {starsAvailable && (
                    <th title="Stars this month (rule breaks)" className="w-10 min-w-10 border-b border-l border-slate-200 py-1 text-center font-semibold text-amber-600 dark:border-slate-800">
                      <Star className="mx-auto size-3.5" aria-label="Stars" />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const mine = byPerson.get(p.id)
                  const counts = countStatuses([...(mine?.values() ?? [])])
                  return (
                    <tr key={p.id} data-person={p.id}>
                      <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 dark:border-slate-800/60 dark:bg-slate-900">
                        <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{p.full_name || p.email}</span>
                        <span className="block truncate text-slate-500">{p.expand?.team?.name ?? 'No team'}</span>
                      </td>
                      {days.map((d) => {
                        const r = mine?.get(d)
                        const off = !workDays.includes(isoWeekday(d)) || holidayName.has(d)
                        return (
                          <td
                            key={d}
                            data-day={d}
                            data-status={r?.status ?? ''}
                            title={r ? cellTitle(d, r, tz) : undefined}
                            className={cn('border-b border-slate-100 p-0.5 text-center dark:border-slate-800/60', off && !r && 'bg-slate-50 dark:bg-slate-800/40')}
                          >
                            {r ? (
                              <span className={cn('flex h-6 items-center justify-center rounded font-semibold', STATUS_CLASS[r.status])}>
                                {STATUS_CODE[r.status]}
                              </span>
                            ) : d < today && employedOn(d, p) && !off ? (
                              <span className="text-slate-300 dark:text-slate-600" title="Not counted yet">
                                –
                              </span>
                            ) : null}
                          </td>
                        )
                      })}
                      {COUNTED.map((s) => (
                        <td key={s} data-total={s} className="border-b border-l border-slate-100 text-center font-semibold tabular-nums dark:border-slate-800/60">
                          {counts[s] || <span className="font-normal text-slate-300 dark:text-slate-600">0</span>}
                        </td>
                      ))}
                      {starsAvailable && (
                        <td data-stars={stars[p.id] ?? 0} className="border-b border-l border-slate-100 p-0.5 text-center dark:border-slate-800/60">
                          <button
                            type="button"
                            title={`Stars for ${p.full_name}`}
                            onClick={() => setStarsFor(p.id)}
                            className="h-6 w-full rounded font-semibold tabular-nums text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                          >
                            {stars[p.id] ?? 0}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        {(['present', 'late', 'half_day', 'absent', 'on_leave', 'holiday'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('flex size-5 items-center justify-center rounded font-semibold', STATUS_CLASS[s])}>{STATUS_CODE[s]}</span>
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-5 rounded bg-slate-100 dark:bg-slate-800/60" /> Weekend
        </span>
        <span>– not counted yet</span>
      </div>
      {starsFor && (people.data ?? []).some((p) => p.id === starsFor) && (
        <StarsDialog
          person={(people.data ?? []).find((p) => p.id === starsFor)!}
          month={month}
          maxDate={today}
          attendance={records.data ?? []}
          admin={isAdmin}
          onClose={() => setStarsFor(null)}
        />
      )}
      <p className="text-xs text-slate-500">
        Attendance is counted every night at 01:00 for the days just finished. Late means the first activity came after the shift start plus the grace
        minutes.
      </p>
    </div>
  )
}
