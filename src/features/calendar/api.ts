import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import type { CalendarEvent, LeaveEntry } from '@/lib/calendar'
import { daysBetween, type Holiday, type HolidayInput } from '@/lib/holidays'

export const calendarKeys = {
  holidays: ['calendar', 'holidays'] as const,
  leaves: (from: string, to: string) => ['calendar', 'leaves', from, to] as const,
  events: (from: string, to: string) => ['calendar', 'events', from, to] as const,
  allEvents: ['calendar', 'events'] as const
}

/** Every holiday (a few dozen a year at most). */
export function useHolidays() {
  return useQuery({
    queryKey: calendarKeys.holidays,
    queryFn: () => pb.collection('holidays').getFullList<Holiday>({ sort: 'date' })
  })
}

/** Adds one holiday per day of the range, or renames/moves one when editing. */
export function useSaveHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: HolidayInput }) => {
      const name = input.name.trim()
      if (id) return [await pb.collection('holidays').update<Holiday>(id, { date: input.from, name })]
      const saved: Holiday[] = []
      for (const date of daysBetween(input.from, input.to || input.from)) {
        saved.push(await pb.collection('holidays').create<Holiday>({ date, name }))
      }
      return saved
    },
    onSettled: () => qc.invalidateQueries({ queryKey: calendarKeys.holidays })
  })
}

export function useDeleteHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('holidays').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.holidays })
  })
}

/** Approved leave overlapping the days shown. The API rules decide whose: own, the teams a manager runs, or everyone for an admin. */
export function useCalendarLeaves(from: string, to: string) {
  return useQuery({
    queryKey: calendarKeys.leaves(from, to),
    queryFn: () =>
      pb.collection('leave_requests').getFullList<LeaveEntry>({
        filter: pb.filter('status = "approved" && start_date <= {:to} && end_date >= {:from}', { from, to }),
        expand: 'user,leave_type',
        fields: 'id,user,start_date,end_date,half_day,expand.user.id,expand.user.full_name,expand.user.team,expand.leave_type.name'
      })
  })
}

/** Events overlapping [start, end) (UTC instants). */
export function useCalendarEvents(start: Date, end: Date) {
  return useQuery({
    queryKey: calendarKeys.events(start.toISOString(), end.toISOString()),
    queryFn: () =>
      pb.collection('events').getFullList<CalendarEvent>({
        filter: pb.filter('starts_at < {:end} && ends_at > {:start}', { start, end }),
        sort: 'starts_at'
      })
  })
}

export type EventData = Omit<CalendarEvent, 'id'>

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: EventData }) =>
      id ? pb.collection('events').update<CalendarEvent>(id, data) : pb.collection('events').create<CalendarEvent>(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.allEvents })
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('events').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.allEvents })
  })
}
