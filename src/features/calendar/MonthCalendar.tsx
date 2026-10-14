import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Input'
import { MonthPicker } from '@/features/attendance/MonthPicker'
import { useTeams } from '@/features/org/api'
import { useOrgSettings } from '@/features/rules/api'
import { useRole } from '@/hooks/useRole'
import { monthOf } from '@/lib/attendance'
import { buildDays, eventTimeLabel, monthGrid, visibleEvent, type CalendarEvent, type DayInfo, type LeaveEntry } from '@/lib/calendar'
import { cn } from '@/lib/cn'
import { addDays, formatDayKey, toDateKey, zonedTimeToUtc, DEFAULT_TZ } from '@/lib/dates'
import { useSession } from '@/stores/session'
import { useCalendarEvents, useCalendarLeaves, useHolidays } from './api'
import { EventDialog } from './EventDialog'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Items shown in a day cell before "+N more". */
const PER_CELL = 3

function leaveLabel(l: LeaveEntry): string {
  const name = l.expand?.user?.full_name ?? 'Someone'
  return `${name}${l.half_day ? ' (½)' : ''}`
}

export function MonthCalendar() {
  const user = useSession((s) => s.user)!
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const workDays = settings.data?.work_days ?? [1, 2, 3, 4, 5]
  const today = toDateKey(Date.now(), tz)
  const [month, setMonth] = useState(() => monthOf(today))
  const [team, setTeam] = useState('')
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; day: string } | null>(null)

  const weeks = useMemo(() => monthGrid(month), [month])
  const from = weeks[0][0]
  const to = weeks[weeks.length - 1][6]
  const holidays = useHolidays()
  const leaves = useCalendarLeaves(from, to)
  const events = useCalendarEvents(zonedTimeToUtc(from, '00:00', tz), zonedTimeToUtc(addDays(to, 1), '00:00', tz))
  const teams = useTeams()

  // Teams whose events I see: my own and the ones I manage; an admin sees all of them.
  const myTeams = useMemo(() => {
    const ids = new Set<string>()
    if (user.team) ids.add(user.team)
    for (const t of teams.data ?? []) if (t.manager === user.id) ids.add(t.id)
    return ids
  }, [teams.data, user.team, user.id])
  const seesAll = user.role === 'admin'
  const filterTeams = (teams.data ?? []).filter((t) => seesAll || myTeams.has(t.id))

  const days = useMemo(() => {
    const shownEvents = (events.data ?? []).filter((e) => visibleEvent(e, myTeams, seesAll) && (!team || !e.team || e.team === team))
    const shownLeaves = (leaves.data ?? []).filter((l) => !team || l.expand?.user?.team === team)
    return buildDays(weeks.flat(), { holidays: holidays.data ?? [], leaves: shownLeaves, events: shownEvents, workDays, tz })
  }, [events.data, leaves.data, holidays.data, myTeams, seesAll, team, weeks, workDays, tz])

  const teamName = (id: string) => teams.data?.find((t) => t.id === id)?.name ?? 'Team'
  const loading = leaves.isLoading || events.isLoading || holidays.isLoading
  const failed = leaves.isError || events.isError || holidays.isError

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <Button variant="secondary" size="sm" onClick={() => setMonth(monthOf(today))} disabled={month === monthOf(today)}>
          Today
        </Button>
        {filterTeams.length > 1 && (
          <Select aria-label="Filter by team" value={team} onChange={(e) => setTeam(e.target.value)} className="w-44">
            <option value="">All teams</option>
            {filterTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
        {isAdmin && (
          <Button className="ml-auto" onClick={() => setEditing({ event: null, day: today >= from && today <= to ? today : `${month}-01` })}>
            <Plus className="size-4" aria-hidden /> Add event
          </Button>
        )}
      </div>

      {failed && <p className="text-sm text-red-600">Could not load everything for this month.</p>}
      <Card className={cn('overflow-hidden', loading && 'opacity-60')}>
        <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="Month">
          {weeks.flat().map((d) => {
            const info = days.get(d)!
            const inMonth = d.startsWith(month)
            const items: { key: string; text: string; className: string }[] = [
              ...info.events.map((e) => ({
                key: `e-${e.id}`,
                text: `${eventTimeLabel(e, d, tz) === 'All day' ? '' : eventTimeLabel(e, d, tz) + ' '}${e.title}`,
                className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              })),
              ...info.leaves.map((l) => ({
                key: `l-${l.id}`,
                text: leaveLabel(l),
                className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
              }))
            ]
            return (
              <div
                key={d}
                role="gridcell"
                tabIndex={0}
                data-day={d}
                data-holiday={info.holiday ?? undefined}
                data-leaves={info.leaves.length}
                data-events={info.events.length}
                onClick={() => setOpenDay(d)}
                onKeyDown={(e) => e.key === 'Enter' && setOpenDay(d)}
                className={cn(
                  'min-h-28 cursor-pointer border-b border-r border-slate-100 p-1.5 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:border-slate-800/60 dark:hover:bg-slate-800/40',
                  (info.off || info.holiday) && 'bg-slate-50/80 dark:bg-slate-900/60',
                  !inMonth && 'opacity-45'
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                      d === today ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-300'
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                </div>
                {info.holiday && (
                  <div className="mt-1 truncate rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300" title={info.holiday}>
                    {info.holiday}
                  </div>
                )}
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, PER_CELL).map((it) => (
                    <div key={it.key} className={cn('truncate rounded px-1.5 py-0.5 text-[11px]', it.className)} title={it.text}>
                      {it.text}
                    </div>
                  ))}
                  {items.length > PER_CELL && <div className="px-1.5 text-[11px] font-medium text-slate-500">+{items.length - PER_CELL} more</div>}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-violet-200 dark:bg-violet-900" /> Holiday
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-emerald-200 dark:bg-emerald-900" /> Event
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-indigo-200 dark:bg-indigo-900" /> On leave (approved)
        </span>
        <span>
          {seesAll ? 'You see everyone’s leave.' : user.role === 'manager' ? 'You see leave for the teams you manage.' : 'You see your own leave.'}
        </span>
      </div>

      {openDay && (
        <DayDialog
          day={openDay}
          info={days.get(openDay)!}
          tz={tz}
          teamName={teamName}
          canEdit={isAdmin}
          onEdit={(event) => {
            setOpenDay(null)
            setEditing({ event, day: openDay })
          }}
          onClose={() => setOpenDay(null)}
        />
      )}
      {editing && <EventDialog event={editing.event} day={editing.day} teams={teams.data ?? []} tz={tz} onClose={() => setEditing(null)} />}
    </div>
  )
}

function DayDialog({
  day,
  info,
  tz,
  teamName,
  canEdit,
  onEdit,
  onClose
}: {
  day: string
  info: DayInfo
  tz: string
  teamName: (id: string) => string
  canEdit: boolean
  onEdit: (event: CalendarEvent | null) => void
  onClose: () => void
}) {
  const empty = !info.holiday && info.events.length === 0 && info.leaves.length === 0
  return (
    <Dialog open onClose={onClose} title={formatDayKey(day)} className="max-w-lg">
      <div className="space-y-4 text-sm" data-day-detail={day}>
        {info.holiday && (
          <p className="rounded-md bg-violet-50 px-3 py-2 text-violet-800 dark:bg-violet-950 dark:text-violet-300">Holiday: {info.holiday}</p>
        )}
        {info.off && !info.holiday && <p className="text-slate-500">Not a working day.</p>}
        {info.events.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Events</h3>
            <ul className="space-y-2">
              {info.events.map((e) => (
                <li key={e.id} className="flex items-start gap-3" data-event={e.id}>
                  <span className="w-24 shrink-0 tabular-nums text-slate-500">{eventTimeLabel(e, day, tz)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-xs text-slate-500">{e.team ? `${teamName(e.team)} team` : 'Everyone'}</span>
                    {e.description && <span className="mt-0.5 block whitespace-pre-line text-xs text-slate-600 dark:text-slate-400">{e.description}</span>}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => onEdit(e)}>
                      Edit
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {info.leaves.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Off</h3>
            <ul className="space-y-1">
              {info.leaves.map((l) => (
                <li key={l.id} data-off={l.user}>
                  <span className="font-medium">{l.expand?.user?.full_name ?? 'Someone'}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {l.expand?.leave_type?.name ?? 'Leave'}
                    {l.half_day ? ' · half day' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {empty && !info.off && <p className="text-slate-500">Nothing on this day.</p>}
        <div className="flex gap-2 pt-1">
          {canEdit && (
            <Button size="sm" onClick={() => onEdit(null)}>
              <Plus className="size-4" aria-hidden /> Add event on this day
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
