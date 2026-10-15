import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
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
      const rules = await pb.collection('star_rules').getFullList<StarRule>({ sort: 'name' })
      // The automatic ones first, then the by-hand ones.
      return rules.sort((a, b) => Number(!a.auto) - Number(!b.auto) || a.name.localeCompare(b.name))
    },
    staleTime: 60_000
  })
}

export function useSaveStarRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Partial<Omit<StarRule, 'id'>> }) =>
      id ? pb.collection('star_rules').update(id, data) : pb.collection('star_rules').create({ ...data, auto: '' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}

export function useDeleteStarRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('star_rules').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}

/** Stars given by hand and excuses in a month: one person's, or everyone the API rules allow. */
export function useStarRecords(month: string, userId?: string) {
  return useQuery({
    queryKey: starKeys.records(month, userId ?? 'visible'),
    queryFn: () =>
      pb.collection('star_records').getFullList<StarRecord>({
        filter: userId
          ? pb.filter('user = {:u} && date >= {:from} && date <= {:to}', { u: userId, from: `${month}-01`, to: `${month}-31` })
          : pb.filter('date >= {:from} && date <= {:to}', { from: `${month}-01`, to: `${month}-31` }),
        expand: 'given_by',
        sort: '-date'
      })
  })
}

/** Admin only: stars by hand ({ excused: false }) or an excuse for an automatic star ({ excused: true }). */
export function useAddStarRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { user: string; rule: string; date: string; note: string; excused: boolean }) =>
      pb.collection('star_records').create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}

/** Admin only: removes stars given by hand, or takes an excuse back. */
export function useDeleteStarRecord() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('star_records').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: starKeys.all })
  })
}
