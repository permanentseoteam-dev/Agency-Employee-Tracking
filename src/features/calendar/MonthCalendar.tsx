import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { MonthPicker } from '@/features/attendance/MonthPicker'
import { useTeams } from '@/features/org/api'
import { useOrgSettings } from '@/features/rules/api'
import { useRole } from '@/hooks/useRole'
import { monthOf } from '@/lib/attendance'
import { buildDays, monthGrid, visibleEvent, type CalendarEvent } from '@/lib/calendar'
import { addDays, toDateKey, zonedTimeToUtc, DEFAULT_TZ } from '@/lib/dates'
import { useSession } from '@/stores/session'
import { useCalendarEvents, useCalendarLeaves, useHolidays } from './api'
import { CalendarGrid, CalendarLegend, DayDialog } from './CalendarGrid'
import { EventDialog } from './EventDialog'

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
      <CalendarGrid weeks={weeks} month={month} today={today} days={days} tz={tz} loading={loading} onOpenDay={setOpenDay} />

      <CalendarLegend>
        {seesAll ? 'You see everyone’s leave.' : user.role === 'manager' ? 'You see leave for the teams you manage.' : 'You see your own leave.'}
      </CalendarLegend>

      {openDay && (
        <DayDialog
          day={openDay}
          info={days.get(openDay)!}
          tz={tz}
          eventNote={(e) => (e.team ? `${teamName(e.team)} team` : 'Everyone')}
          leaveNote={(l) => l.expand?.leave_type?.name ?? 'Leave'}
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
