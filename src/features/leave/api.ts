import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import type { LeaveBalance, LeaveInput, LeaveRequest, LeaveStatus } from '@/lib/leave'
import { useSession } from '@/stores/session'

export const leaveKeys = {
  all: ['leave'] as const,
  mine: (userId: string) => ['leave', 'mine', userId] as const,
  balances: (userId: string) => ['leave', 'balances', userId] as const,
  pending: (userId: string) => ['leave', 'pending', userId] as const,
  decided: (userId: string, limit: number) => ['leave', 'decided', userId, limit] as const
}

const EXPAND = 'user,leave_type,approver'

/**
 * Keeps the leave lists fresh while a leave screen is open: any change to a request I
 * can see (mine, my teams', or everyone's for an admin) refetches them.
 */
export function useLeaveLive() {
  const qc = useQueryClient()
  const userId = useSession((s) => s.user?.id ?? '')
  useEffect(() => {
    if (!userId) return
    let unsubscribe: (() => Promise<void>) | undefined
    let cancelled = false
    pb.collection('leave_requests')
      .subscribe('*', () => void qc.invalidateQueries({ queryKey: leaveKeys.all }))
      .then((fn) => {
        if (cancelled) void fn()
        else unsubscribe = fn
      })
      .catch(() => {
        /* offline: the refetch on reconnect catches up */
      })
    return () => {
      cancelled = true
      void unsubscribe?.()
    }
  }, [qc, userId])
}

/** My own requests, newest first (every status). */
export function useMyLeaves() {
  const userId = useSession((s) => s.user?.id ?? '')
  return useQuery({
    queryKey: leaveKeys.mine(userId),
    enabled: !!userId,
    queryFn: () =>
      pb.collection('leave_requests').getFullList<LeaveRequest>({
        filter: pb.filter('user = {:u}', { u: userId }),
        sort: '-start_date',
        expand: EXPAND
      })
  })
}

/**
 * This year's balances from the leave_balances view (quota − approved days). Without
 * `userId` the API rules decide whose: own, a manager's teams, or everyone for an admin.
 */
export function useLeaveBalances(userId?: string) {
  return useQuery({
    queryKey: leaveKeys.balances(userId ?? 'visible'),
    queryFn: () =>
      pb.collection('leave_balances').getFullList<LeaveBalance>({
        filter: userId ? pb.filter('user = {:u}', { u: userId }) : '',
        expand: 'user,leave_type'
      })
  })
}

/** Pending requests from other people that I can see (my teams, or everyone for an admin), oldest first. */
export function usePendingApprovals() {
  const userId = useSession((s) => s.user?.id ?? '')
  return useQuery({
    queryKey: leaveKeys.pending(userId),
    enabled: !!userId,
    queryFn: () =>
      pb.collection('leave_requests').getFullList<LeaveRequest>({
        filter: pb.filter('status = "pending" && user != {:me}', { me: userId }),
        sort: 'start_date,created',
        expand: EXPAND
      })
  })
}

/** Recently decided requests from other people that I can see, latest decision first. */
export function useDecidedLeaves(limit = 50) {
  const userId = useSession((s) => s.user?.id ?? '')
  return useQuery({
    queryKey: leaveKeys.decided(userId, limit),
    enabled: !!userId,
    queryFn: async () =>
      (
        await pb.collection('leave_requests').getList<LeaveRequest>(1, limit, {
          filter: pb.filter('status != "pending" && user != {:me}', { me: userId }),
          sort: '-decided_at,-updated',
          expand: EXPAND
        })
      ).items
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
  const userId = useSession((s) => s.user?.id ?? '')
  return useMutation({
    mutationFn: (input: LeaveInput) =>
      pb.collection('leave_requests').create<LeaveRequest>({
        user: userId,
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
    mutationFn: (id: string) => pb.collection('leave_requests').update<LeaveRequest>(id, { status: 'cancelled' }),
    onSuccess: () => invalidateLeave(qc)
  })
}

/** Approve, reject, or (admins) reverse or cancel a decision. The server records who and when. */
export function useDecideLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, comment }: { id: string; status: Exclude<LeaveStatus, 'pending'>; comment?: string }) =>
      pb.collection('leave_requests').update<LeaveRequest>(id, comment === undefined ? { status } : { status, comment: comment.trim() }),
    onSuccess: () => invalidateLeave(qc)
  })
}
