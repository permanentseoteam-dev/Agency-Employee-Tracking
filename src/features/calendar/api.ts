import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { must, supabase } from '@/lib/db'
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
    queryFn: async () => must(await supabase.from('holidays').select('*').order('date')) as Holiday[]
  })
}

/** Adds one holiday per day of the range, or renames/moves one when editing. */
export function useSaveHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: HolidayInput }) => {
      const name = input.name.trim()
      if (id) return must(await supabase.from('holidays').update({ date: input.from, name }).eq('id', id).select()) as Holiday[]
      const saved: Holiday[] = []
      for (const date of daysBetween(input.from, input.to || input.from)) {
        saved.push(must(await supabase.from('holidays').insert({ date, name }).select().single()) as Holiday)
      }
      return saved
    },
    onSettled: () => qc.invalidateQueries({ queryKey: calendarKeys.holidays })
  })
}

export function useDeleteHoliday() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('holidays').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.holidays })
  })
}

/** Approved leave overlapping the days shown. The API rules decide whose: own, the teams a manager runs, or everyone for an admin. */
export function useCalendarLeaves(from: string, to: string) {
  return useQuery({
    queryKey: calendarKeys.leaves(from, to),
    queryFn: async () => {
      const rows = must(
        await supabase
          .from('leave_requests')
          .select('id, user, start_date, end_date, half_day, user_row:profiles!leave_requests_user_fkey(id, full_name, team), type_row:leave_types(name)')
          .eq('status', 'approved')
          .lte('start_date', to)
          .gte('end_date', from)
      ) as unknown as (Omit<LeaveEntry, 'expand'> & { user_row: { id: string; full_name: string; team: string | null } | null; type_row: { name: string } | null })[]
      return rows.map(({ user_row, type_row, ...l }) => ({
        ...l,
        expand: {
          ...(user_row ? { user: { ...user_row, team: user_row.team ?? '' } } : {}),
          ...(type_row ? { leave_type: type_row } : {})
        }
      })) as LeaveEntry[]
    }
  })
}

/** Events overlapping [start, end) (UTC instants). */
export function useCalendarEvents(start: Date, end: Date) {
  return useQuery({
    queryKey: calendarKeys.events(start.toISOString(), end.toISOString()),
    queryFn: async () =>
      (must(
        await supabase.from('events').select('*').lt('starts_at', end.toISOString()).gt('ends_at', start.toISOString()).order('starts_at')
      ) as CalendarEvent[]).map((e) => ({ ...e, team: e.team ?? '' }))
  })
}

export type EventData = Omit<CalendarEvent, 'id'>

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: EventData }) => {
      const row = { ...data, team: data.team || null } // '' = company-wide
      return id
        ? (must(await supabase.from('events').update(row).eq('id', id).select().single()) as CalendarEvent)
        : (must(await supabase.from('events').insert(row).select().single()) as CalendarEvent)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.allEvents })
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('events').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKeys.allEvents })
  })
}
