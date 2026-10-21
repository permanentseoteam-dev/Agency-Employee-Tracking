import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call, must, selectAll, supabase, toUser } from '@/lib/db'
import type { StarRecord, StarRule } from '@/lib/stars'

export const starKeys = {
  all: ['stars'] as const,
  rules: ['stars', 'rules'] as const,
  records: (month: string, scope: string) => ['stars', 'records', month, scope] as const
}

/** The rule breaks and their stars: everyone reads them, only admins change them. */
export function useStarRules() {
  return useQuery({
    queryKey: starKeys.rules,
    queryFn: async () => {
      const rules = must(await supabase.from('star_rules').select('*').order('name')) as StarRule[]
      // The automatic ones first, then the by-hand ones.
      return rules.sort((a, b) => Number(!a.auto) - Number(!b.auto) || a.name.localeCompare(b.name))
    },
    staleTime: 60_000
  })
}

export function useSaveStarRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Partial<Omit<StarRule, 'id'>> }) =>
      id
        ? must(await supabase.from('star_rules').update(data).eq('id', id).select().single())
        : must(await supabase.from('star_rules').insert({ ...data, auto: '' }).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}

/** Admin only: adds a deleted automatic rule back, so its stars count again. */
export function useAddAutoRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Pick<StarRule, 'auto' | 'name' | 'description'>) =>
      must(await supabase.from('star_rules').insert({ ...data, stars: 0 }).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}

export function useDeleteStarRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('star_rules').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}

/** Stars given by hand and excuses in a month: one person's, or everyone the API rules allow. */
export function useStarRecords(month: string, userId?: string) {
  return useQuery({
    queryKey: starKeys.records(month, userId ?? 'visible'),
    queryFn: async () => {
      const rows = await selectAll<Record<string, unknown> & { given_row?: Record<string, unknown> | null }>(() => {
        let q = supabase
          .from('star_records')
          .select('*, given_row:profiles!star_records_given_by_fkey(*)')
          .gte('date', `${month}-01`)
          .lte('date', `${month}-31`)
        if (userId) q = q.eq('user', userId)
        return q.order('date', { ascending: false }).order('id')
      })
      return rows.map(({ given_row, ...r }) => ({
        ...r,
        given_by: (r.given_by as string | null) ?? '',
        expand: given_row ? { given_by: toUser(given_row) } : {}
      })) as unknown as StarRecord[]
    }
  })
}

/** Admin only: stars by hand ({ excused: false }) or an excuse for an automatic star ({ excused: true }). */
export function useAddStarRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { user: string; rule: string; date: string; note: string; excused: boolean }) => call('star-record', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}

/**
 * Admin only: removes stars given by hand, or takes an excuse back. Through the server, which
 * refuses a month whose payroll is approved and counts the day again so its pay follows.
 */
export function useDeleteStarRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => call('star-record', { remove: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}
