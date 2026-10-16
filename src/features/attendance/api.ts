import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call, must, PROFILE_WITH_TEAM, selectAll, supabase, toEmployee } from '@/lib/db'
import type { AttendanceRecord } from '@/lib/attendance'
import { useSession } from '@/stores/session'
import type { Employee } from '@/features/org/api'

export const attendanceKeys = {
  all: ['attendance'] as const,
  month: (month: string, scope: string) => ['attendance', 'month', month, scope] as const,
  people: (month: string, userId: string) => ['attendance', 'people', month, userId] as const
}

/** Attendance records in a month. `userId` limits it to one person; otherwise the API rules decide (own, team, everyone). */
export function useMonthAttendance(month: string, userId?: string) {
  return useQuery({
    queryKey: attendanceKeys.month(month, userId ?? 'visible'),
    queryFn: () =>
      selectAll<AttendanceRecord>(() => {
        let q = supabase.from('attendance').select('*').gte('date', `${month}-01`).lte('date', `${month}-31`)
        if (userId) q = q.eq('user', userId)
        return q.order('date').order('id')
      }).then((rows) => rows.map((r) => ({ ...r, first_activity_at: r.first_activity_at ?? '', last_activity_at: r.last_activity_at ?? '' })))
  })
}

/**
 * The people on the grid for a month: everyone (admin) or the teams the manager manages,
 * including people who left during or after that month.
 */
export function useAttendancePeople(month: string) {
  const user = useSession((s) => s.user)
  return useQuery({
    queryKey: attendanceKeys.people(month, user?.id ?? ''),
    enabled: !!user,
    queryFn: async () => {
      const start = `${month}-01`
      const end = `${month}-31`
      let q = supabase.from('profiles').select(PROFILE_WITH_TEAM).order('full_name')
      if (user!.role !== 'admin') {
        const teams = must(await supabase.from('teams').select('id').eq('manager', user!.id)) as { id: string }[]
        q = q.in('team', teams.map((t) => t.id))
      }
      // Employed during the month: still active or left on/after its first day, and joined by its last.
      return must(await q)
        .map((r) => toEmployee<Employee>(r))
        .filter((p) => (p.active || (p.left_on !== '' && p.left_on >= start)) && (p.joined_on === '' || p.joined_on <= end))
    }
  })
}

export interface RecomputeResult {
  from: string
  to: string
  days: number
  records: number
}

/** Admin only: count the days again (e.g. after adding a holiday or approving leave late). */
export function useRecompute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (range: { from: string; to: string }) => call<RecomputeResult>('attendance-recompute', range),
    onSuccess: () => qc.invalidateQueries({ queryKey: attendanceKeys.all })
  })
}
