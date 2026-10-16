import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Avatar } from '@/components/layout/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { STATUS_CLASS } from '@/features/attendance/status'
import { useOrgSettings } from '@/features/rules/api'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import { addDays, formatDayKey, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { chipStatuses, countStatuses, sortByStatus, TEAM_STATUS_LABEL, type CountedStatus, type TeamStatus } from '@/lib/projects'
import { errorMessage, useSession } from '@/stores/session'
import { useChangeMembers, useTeamStatus } from './api'
import { useClient } from './ClientPage'

const MONTH_COLUMNS: { key: CountedStatus; short: string }[] = [
  { key: 'present', short: 'P' },
  { key: 'late', short: 'L' },
  { key: 'half_day', short: '½' },
  { key: 'absent', short: 'A' },
  { key: 'on_leave', short: 'LV' }
]

const NOT_IN_YET_CLASS = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
const DOT_CLASS: Record<string, string> = {
  present: 'bg-emerald-500',
  late: 'bg-amber-500',
  half_day: 'bg-orange-500',
  absent: 'bg-red-500',
  on_leave: 'bg-indigo-500',
  not_in_yet: 'bg-slate-400'
}

export function TeamStatusBadge({ status }: { status: TeamStatus }) {
  if (!status) return <span className="text-slate-400">—</span>
  return (
    <span
      className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', status === 'not_in_yet' ? NOT_IN_YET_CLASS : STATUS_CLASS[status])}
      data-status={status}
    >
      {TEAM_STATUS_LABEL[status]}
    </span>
  )
}

/** A client's people and how each is doing on one day (live for today), with this month's totals. */
export function ClientTeam() {
  const client = useClient()
  const me = useSession((s) => s.user)!
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const today = toDateKey(Date.now(), tz)
  const [date, setDate] = useState(today)
  const [only, setOnly] = useState<TeamStatus | null>(null)
  const isToday = date === today
  const status = useTeamStatus(client.id, date, isToday)
  const change = useChangeMembers()
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    const byUser = new Map((status.data?.members ?? []).map((m) => [m.user, m]))
    return sortByStatus(
      (client.expand?.members ?? []).map((p) => {
        const m = byUser.get(p.id)
        return { person: p, name: p.full_name, status: (m?.status ?? '') as TeamStatus, month: m?.month }
      })
    )
  }, [client.expand?.members, status.data])
  const counts = countStatuses(rows)
  const shown = only ? rows.filter((r) => r.status === only) : rows

  function go(next: string) {
    setDate(next > today ? today : next)
    setOnly(null)
  }

  async function onRemove(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from ${client.name}?`)) return
    setError(null)
    try {
      await change.mutateAsync({ id: client.id, remove: id })
    } catch (err) {
      setError(errorMessage(err, 'Could not remove them.'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Day">
          <Button variant="ghost" size="sm" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-44 text-center text-sm font-semibold tabular-nums" data-date={date}>
            {isToday ? `Today, ${formatDayKey(date)}` : formatDayKey(date)}
          </span>
          <Button variant="ghost" size="sm" aria-label="Next day" disabled={isToday} onClick={() => go(addDays(date, 1))}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        {!isToday && (
          <Button variant="secondary" size="sm" onClick={() => go(today)}>
            Today
          </Button>
        )}
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2 sm:ml-auto">
          {chipStatuses(isToday).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={only === s}
              onClick={() => setOnly(only === s ? null : s)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm',
                only === s
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
            >
              <span className={cn('size-2 rounded-full', DOT_CLASS[s])} aria-hidden />
              {TEAM_STATUS_LABEL[s]}
              <span className="font-semibold tabular-nums" data-count={s}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <FormError message={error} />
      <Card className="overflow-x-auto">
        {status.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : status.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the team’s status.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{isAdmin ? 'Nobody on this client yet. Use “Add people”.' : 'Nobody on this client yet.'}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Team</Th>
                <Th>{isToday ? 'Today' : 'Status'}</Th>
                {MONTH_COLUMNS.map((c, i) => (
                  <Th key={c.key} className={cn('w-12 text-right', i === 0 && 'border-l border-slate-200 dark:border-slate-800')} title={`${TEAM_STATUS_LABEL[c.key]} this month`}>
                    {c.short}
                  </Th>
                ))}
                {isAdmin && <Th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.person.id} data-member={r.person.id}>
                  <Td>
                    <span className="flex items-center gap-3">
                      <Avatar user={r.person} size={32} />
                      <span className="min-w-0 max-w-60 @6xl/page:max-w-96">
                        <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                          {r.person.full_name}
                          {r.person.id === me.id && <span className="ml-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">You</span>}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{r.person.designation || '—'}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>{r.person.expand?.team?.name ?? <span className="text-slate-400">—</span>}</Td>
                  <Td>
                    <TeamStatusBadge status={r.status} />
                  </Td>
                  {MONTH_COLUMNS.map((c, i) => {
                    const n = r.month?.[c.key] ?? 0
                    return (
                      <Td key={c.key} className={cn('text-right tabular-nums', !n && 'text-slate-400', i === 0 && 'border-l border-slate-200 dark:border-slate-800')}>
                        {n}
                      </Td>
                    )
                  })}
                  {isAdmin && (
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" aria-label={`Remove ${r.person.full_name} from ${client.name}`} onClick={() => void onRemove(r.person.id, r.person.full_name)}>
                        <X className="size-4" aria-hidden />
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <Td colSpan={isAdmin ? 9 : 8} className="text-center text-slate-500">
                    Nobody with this status.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        P, L, ½, A and LV count this month’s finished working days (Present, Late, Half day, Absent, On leave).{' '}
        {isToday
          ? 'Today updates every minute: “Not in yet” turns into Absent once the shift ends, and Half day is decided when the shift is over.'
          : 'A past day shows its counted attendance.'}{' '}
        {!isAdmin && 'You see the clients you work on; only the admin changes clients and their people.'}
      </p>
    </div>
  )
}
