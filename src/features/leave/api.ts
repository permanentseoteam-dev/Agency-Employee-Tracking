import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call, live, must, supabase, toUser } from '@/lib/db'
import type { LeaveBalance, LeaveInput, LeaveRequest, LeaveStatus } from '@/lib/leave'
import { useSession } from '@/stores/session'

export const leaveKeys = {
  all: ['leave'] as const,
  mine: (userId: string) => ['leave', 'mine', userId] as const,
  balances: (userId: string) => ['leave', 'balances', userId] as const,
  pending: (userId: string) => ['leave', 'pending', userId] as const,
  decided: (userId: string, limit: number) => ['leave', 'decided', userId, limit] as const,
  onDay: (day: string) => ['leave', 'on-day', day] as const
}

// A request with the people and leave type the screens show (embedded user, leave_type and approver).
const WITH_NAMES =
  '*, user_row:profiles!leave_requests_user_fkey(*), type_row:leave_types(*), approver_row:profiles!leave_requests_approver_fkey(*)'
type Row = Record<string, unknown> & { user_row?: Record<string, unknown> | null; type_row?: Record<string, unknown> | null; approver_row?: Record<string, unknown> | null }
function toRequest({ user_row, type_row, approver_row, ...r }: Row): LeaveRequest {
  return {
    ...(r as unknown as LeaveRequest),
    approver: (r.approver as string | null) ?? '',
    decided_at: (r.decided_at as string | null) ?? '',
    expand: {
      ...(user_row ? { user: toUser(user_row) } : {}),
      ...(type_row ? { leave_type: type_row } : {}),
      ...(approver_row ? { approver: toUser(approver_row) } : {})
    }
  } as LeaveRequest
}

/**
 * Keeps the leave lists fresh while a leave screen is open: any change to a request I
 * can see (mine, my teams', or everyone's for an admin) refetches them.
 */
export function useLeaveLive() {
  const qc = useQueryClient()
  const userId = useSession((s) => s.user?.id ?? '')
  useEffect(() => (userId ? live('leave_requests', () => void qc.invalidateQueries({ queryKey: leaveKeys.all })) : undefined), [qc, userId])
}

/** My own requests, newest first (every status). */
export function useMyLeaves() {
  const userId = useSession((s) => s.user?.id ?? '')
  return useQuery({
    queryKey: leaveKeys.mine(userId),
    enabled: !!userId,
    queryFn: async () =>
      must(await supabase.from('leave_requests').select(WITH_NAMES).eq('user', userId).order('start_date', { ascending: false })).map((r) => toRequest(r as Row))
  })
}

/**
 * This year's balances from the leave_balances view (quota − approved days). Without
 * `userId` the rules decide whose: own, a manager's teams, or everyone for an admin.
 */
export function useLeaveBalances(userId?: string) {
  return useQuery({
    queryKey: leaveKeys.balances(userId ?? 'visible'),
    queryFn: async () => {
      let q = supabase.from('leave_balances').select('*')
      if (userId) q = q.eq('user', userId)
      const rows = must(await q) as Record<string, unknown>[]
      const [people, types] = await Promise.all([
        supabase.from('profiles').select('*').in('id', [...new Set(rows.map((r) => r.user as string))]),
        supabase.from('leave_types').select('*')
      ])
      const personOf = new Map(must(people).map((p) => [p.id as string, toUser(p)]))
      const typeOf = new Map(must(types).map((t) => [t.id as string, t]))
      return rows.map((b) => ({
        ...b,
        expand: { user: personOf.get(b.user as string), leave_type: typeOf.get(b.leave_type as string) }
      })) as unknown as LeaveBalance[]
    }
  })
}

/** Pending requests from other people that I can see (my teams, or everyone for an admin), oldest first. */
export function usePendingApprovals() {
  const userId = useSession((s) => s.user?.id ?? '')
  return useQuery({
    queryKey: leaveKeys.pending(userId),
    enabled: !!userId,
    queryFn: async () =>
      must(
        await supabase.from('leave_requests').select(WITH_NAMES).eq('status', 'pending').neq('user', userId).order('start_date').order('created')
      ).map((r) => toRequest(r as Row))
  })
}

/** Recently decided requests from other people that I can see, latest decision first. */
export function useDecidedLeaves(limit = 50) {
  const userId = useSession((s) => s.user?.id ?? '')
  return useQuery({
    queryKey: leaveKeys.decided(userId, limit),
    enabled: !!userId,
    queryFn: async () =>
      must(
        await supabase
          .from('leave_requests')
          .select(WITH_NAMES)
          .neq('status', 'pending')
          .neq('user', userId)
          .order('decided_at', { ascending: false, nullsFirst: false })
          .order('updated', { ascending: false })
          .limit(limit)
      ).map((r) => toRequest(r as Row))
  })
}

/** Ids of the people on approved leave on a day (the rules decide whose: own, my teams, or everyone). */
export function useOnLeave(day: string) {
  return useQuery({
    queryKey: leaveKeys.onDay(day),
    enabled: !!day,
    queryFn: async () =>
      (must(await supabase.from('leave_requests').select('user').eq('status', 'approved').lte('start_date', day).gte('end_date', day)) as { user: string }[]).map(
        (r) => r.user
      )
  })
}

/** Everything that shows leave: lists, balances, the calendar, attendance and the bell. */
function invalidateLeave(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [leaveKeys.all, ['calendar', 'leaves'], ['attendance'], ['notifications']]) {
    void qc.invalidateQueries({ queryKey: key })
  }
}

/** Sends a request. The server counts the days and sets it to pending. */
export function useApplyLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LeaveInput) =>
      call<LeaveRequest>('leave-request', {
        leave_type: input.leave_type,
        start_date: input.start_date,
        end_date: input.end_date,
        half_day: input.half_day,
        reason: input.reason.trim()
      }),
    onSuccess: () => invalidateLeave(qc)
  })
}

/** Cancels my own pending request. */
export function useCancelLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => call<LeaveRequest>('leave-update', { id, status: 'cancelled' }),
    onSuccess: () => invalidateLeave(qc)
  })
}

/** Approve, reject, or (admins) reverse or cancel a decision. The server records who and when. */
export function useDecideLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: Exclude<LeaveStatus, 'pending'>; comment?: string }) =>
      call<LeaveRequest>('leave-update', comment === undefined ? { id, status } : { id, status, comment: comment.trim() }),
    onSuccess: () => invalidateLeave(qc)
  })
}
