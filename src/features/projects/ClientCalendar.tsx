import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { MonthPicker } from '@/features/attendance/MonthPicker'
import { useHolidays } from '@/features/calendar/api'
import { CalendarGrid, CalendarLegend, DayDialog } from '@/features/calendar/CalendarGrid'
import { EventForm } from '@/features/calendar/EventDialog'
import { useOrgSettings } from '@/features/rules/api'
import { monthOf } from '@/lib/attendance'
import { buildDays, monthGrid, type CalendarEvent, type LeaveEntry } from '@/lib/calendar'
import { addDays, toDateKey, zonedTimeToUtc, DEFAULT_TZ } from '@/lib/dates'
import { useDeleteProjectEvent, useProjectEvents, useSaveProjectEvent, useTeamLeaves } from './api'
import { useClient } from './ClientPage'

/** A client's own calendar: its meetings and deadlines, company holidays, and its people's approved leave. Everyone on the client can edit it. */
export function ClientCalendar() {
  const client = useClient()
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const workDays = settings.data?.work_days ?? [1, 2, 3, 4, 5]
  const today = toDateKey(Date.now(), tz)
  const [month, setMonth] = useState(() => monthOf(today))
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; day: string } | null>(null)

  const weeks = useMemo(() => monthGrid(month), [month])
  const from = weeks[0][0]
  const to = weeks[weeks.length - 1][6]
  const holidays = useHolidays()
  const events = useProjectEvents(client.id, zonedTimeToUtc(from, '00:00', tz), zonedTimeToUtc(addDays(to, 1), '00:00', tz))
  const leaves = useTeamLeaves(client.id, from, to)
  const save = useSaveProjectEvent(client.id)
  const remove = useDeleteProjectEvent()

  const people = useMemo(() => new Map((client.expand?.members ?? []).map((p) => [p.id, p])), [client.expand?.members])
  const addedBy = useMemo(() => new Map((events.data ?? []).map((e) => [e.id, e.created_by])), [events.data])

  const days = useMemo(() => {
    const shownEvents: CalendarEvent[] = (events.data ?? []).map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, description: e.description, team: '' }))
    const shownLeaves: LeaveEntry[] = (leaves.data ?? []).map((l) => {
      const p = people.get(l.user)
      return { ...l, expand: { user: { id: l.user, full_name: p?.full_name ?? 'Someone', team: p?.team ?? '' } } }
    })
    return buildDays(weeks.flat(), { holidays: holidays.data ?? [], leaves: shownLeaves, events: shownEvents, workDays, tz })
  }, [events.data, leaves.data, holidays.data, people, weeks, workDays, tz])

  const loading = events.isLoading || leaves.isLoading || holidays.isLoading
  const failed = events.isError || leaves.isError || holidays.isError
  const nameOf = (userId: string) => (userId ? (people.get(userId)?.full_name ?? 'someone no longer on this client') : 'the admin')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <Button variant="secondary" size="sm" onClick={() => setMonth(monthOf(today))} disabled={month === monthOf(today)}>
          Today
        </Button>
        <Button className="ml-auto" onClick={() => setEditing({ event: null, day: today >= from && today <= to ? today : `${month}-01` })}>
          <Plus className="size-4" aria-hidden /> Add event
        </Button>
      </div>

      {failed && <p className="text-sm text-red-600">Could not load everything for this month.</p>}
      <CalendarGrid weeks={weeks} month={month} today={today} days={days} tz={tz} loading={loading} onOpenDay={setOpenDay} />
      <CalendarLegend>Only {client.name}’s events, and leave for the people on it. Everyone on {client.name} can add and change events.</CalendarLegend>

      {openDay && (
        <DayDialog
          day={openDay}
          info={days.get(openDay)!}
          tz={tz}
          eventNote={(e) => `Added by ${nameOf(addedBy.get(e.id) ?? '')}`}
          leaveNote={() => 'On leave'}
          canEdit
          onEdit={(event) => {
            setOpenDay(null)
            setEditing({ event, day: openDay })
          }}
          onClose={() => setOpenDay(null)}
        />
      )}
      {editing && (
        <EventForm
          event={editing.event}
          day={editing.day}
          tz={tz}
          placeholder="e.g. Monthly report call"
          saving={save.isPending}
          deleting={remove.isPending}
          onSave={({ title, description, starts_at, ends_at }) => save.mutateAsync({ id: editing.event?.id, data: { title, description, starts_at, ends_at } })}
          onDelete={editing.event ? () => remove.mutateAsync(editing.event!.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
