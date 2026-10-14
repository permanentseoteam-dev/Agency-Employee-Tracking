import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
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
      pb.collection('attendance').getFullList<AttendanceRecord>({
        filter: userId
          ? pb.filter('user = {:u} && date >= {:from} && date <= {:to}', { u: userId, from: `${month}-01`, to: `${month}-31` })
          : pb.filter('date >= {:from} && date <= {:to}', { from: `${month}-01`, to: `${month}-31` }),
        sort: 'date'
      })
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
      const employed = pb.filter('(active = true || left_on >= {:start}) && (joined_on = "" || joined_on <= {:end})', {
        start: `${month}-01`,
        end: `${month}-31`
      })
      const scope = user!.role === 'admin' ? '' : ` && ${pb.filter('team.manager = {:me}', { me: user!.id })}`
      return pb.collection('users').getFullList<Employee>({ filter: employed + scope, sort: 'full_name', expand: 'team' })
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
    mutationFn: (range: { from: string; to: string }) =>
      pb.send<RecomputeResult>('/api/attendance/recompute', { method: 'POST', body: range }),
    onSuccess: () => qc.invalidateQueries({ queryKey: attendanceKeys.all })
  })
}
