import { useMemo, useState } from 'react'
import { Avatar } from '@/components/layout/Avatar'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { useLeaveLive, useOnLeave } from '@/features/leave/api'
import { formatTime, toDateKey } from '@/lib/dates'
import { formatDuration } from '@/lib/format'
import { boardStatus, presenceToday, type BoardStatus } from '@/lib/tracking'
import { cn } from '@/lib/cn'
import { useNow, usePeople, usePresence, useTimezone } from './api'
import { StatusBadge, STATUS_LABEL } from './StatusBadge'

const ORDER: Record<BoardStatus, number> = { active: 0, idle: 1, on_leave: 2, offline: 3 }
const FILTERS: BoardStatus[] = ['active', 'idle', 'on_leave', 'offline']

export function LiveBoard() {
  const tz = useTimezone()
  const now = useNow()
  const people = usePeople()
  const presence = usePresence()
  const onLeave = useOnLeave(toDateKey(now, tz))
  useLeaveLive()
  const [team, setTeam] = useState('')
  const [search, setSearch] = useState('')
  const [only, setOnly] = useState<BoardStatus | ''>('')

  const teams = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of people.data ?? []) if (p.expand?.team) map.set(p.expand.team.id, p.expand.team.name)
    return [...map].sort((a, b) => a[1].localeCompare(b[1]))
  }, [people.data])

  const cards = useMemo(() => {
    const q = search.trim().toLowerCase()
    const away = new Set(onLeave.data ?? [])
    return (people.data ?? [])
      .filter((p) => (!team || p.team === team) && (!q || p.full_name.toLowerCase().includes(q)))
      .map((p) => {
        const rec = presence.data?.[p.id]
        return { person: p, rec, status: boardStatus(rec, now, away.has(p.id)), today: presenceToday(rec, now, tz) }
      })
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.person.full_name.localeCompare(b.person.full_name))
  }, [people.data, presence.data, onLeave.data, team, search, now, tz])

  const counts = { active: 0, idle: 0, on_leave: 0, offline: 0 }
  for (const c of cards) counts[c.status]++
  const shown = only ? cards.filter((c) => c.status === only) : cards

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Search people" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        {teams.length > 1 && (
          <Select aria-label="Filter by team" value={team} onChange={(e) => setTeam(e.target.value)} className="w-48">
            <option value="">All teams</option>
            {teams.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        )}
        <div role="group" aria-label="Filter by status" className="ml-auto flex gap-2">
          {FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={only === s}
              onClick={() => setOnly(only === s ? '' : s)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm',
                only === s
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
            >
              {STATUS_LABEL[s]} <span className="font-semibold tabular-nums" data-count={s}>{counts[s]}</span>
            </button>
          ))}
        </div>
      </div>

      {people.isLoading || presence.isLoading ? (
        <p className="text-sm text-slate-500">Loading the board…</p>
      ) : people.isError || presence.isError ? (
        <p className="text-sm text-red-600">Could not load the board.</p>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-sm text-slate-500">
          {cards.length === 0 ? 'Nobody to show yet. People appear here once they are in a team you manage.' : 'Nobody matches these filters.'}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ person, rec, status, today }) => (
            <Card key={person.id} className="p-4" data-person={person.id} data-status={status}>
              <div className="flex items-center gap-3">
                <Avatar user={person} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{person.full_name || person.email}</div>
                  <div className="truncate text-xs text-slate-500">
                    {person.expand?.team?.name ?? 'No team'}
                    {person.designation ? ` · ${person.designation}` : ''}
                  </div>
                </div>
                <StatusBadge status={status} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Active</dt>
                  <dd className="font-semibold tabular-nums">{formatDuration(today.active_s)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Idle</dt>
                  <dd className="font-semibold tabular-nums">{formatDuration(today.idle_s)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Last seen</dt>
                  <dd className="tabular-nums">{rec?.last_seen ? formatTime(rec.last_seen.replace(' ', 'T'), tz) : '—'}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">
        Updates live. Someone is shown Offline when their app hasn’t checked in for 2 minutes, and On leave when they are offline
        with approved leave today.
      </p>
    </div>
  )
}
