import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import { daysBetween, type Holiday, type HolidayInput } from '@/lib/holidays'

export const calendarKeys = {
  holidays: ['calendar', 'holidays'] as const
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
