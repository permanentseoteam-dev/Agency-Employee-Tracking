import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { dayRangeUtc, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { pb } from '@/lib/pb'
import type { PresenceRecord, ReportRow, SegmentRow } from '@/lib/tracking'
import { useSession } from '@/stores/session'
import { useOrgSettings } from '@/features/rules/api'
import type { Employee, Team } from '@/features/org/api'

export type TrackerStatus = Awaited<ReturnType<Window['tracker']['getStatus']>>

export const trackingKeys = {
  people: (userId: string) => ['tracking', 'people', userId] as const,
  presence: ['tracking', 'presence'] as const,
  week: (userId: string, monday: string) => ['tracking', 'week', userId, monday] as const,
  report: (params: ReportParams) => ['tracking', 'report', params] as const
}

export function useTimezone(): string {
  return useOrgSettings().data?.timezone || DEFAULT_TZ
}

/** The tracker's live status from the main process (includes time not yet synced). */
export function useTrackerStatus(): TrackerStatus | null {
  const [status, setStatus] = useState<TrackerStatus | null>(null)
  useEffect(() => {
    let alive = true
    void window.tracker.getStatus().then((s) => alive && setStatus(s))
    const off = window.tracker.onStatus(setStatus)
    return () => {
      alive = false
      off()
    }
  }, [])
  return status
}

/** A clock that ticks, so "Offline after 2 minutes" updates without new data. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** My own segments from Monday of this week. */
export function useMyWeek(monday: string) {
  const user = useSession((s) => s.user)
  const tz = useTimezone()
  return useQuery({
    queryKey: trackingKeys.week(user?.id ?? '', monday),
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: () =>
      pb.collection('activity_segments').getFullList<SegmentRow>({
        filter: pb.filter('user = {:u} && started_at >= {:start}', { u: user!.id, start: dayRangeUtc(monday, tz).start }),
        fields: 'state,started_at,ended_at'
      })
  })
}

/**
 * The people a manager or admin may watch: everyone active for an admin, the
 * members of the teams they manage for a manager (the presence rules match this).
 * Kept live: a new hire, a deactivation or a team change shows without leaving the screen.
 */
export function usePeople() {
  const user = useSession((s) => s.user)
  const qc = useQueryClient()
  const userId = user?.id ?? ''
  const query = useQuery({
    queryKey: trackingKeys.people(userId),
    enabled: !!user,
    queryFn: () =>
      pb.collection('users').getFullList<Employee>({
        filter:
          user!.role === 'admin' ? 'active = true' : pb.filter('active = true && team.manager = {:me}', { me: user!.id }),
        sort: 'full_name',
        expand: 'team'
      })
  })

  useEffect(() => {
    if (!userId) return
    const refresh = () => void qc.invalidateQueries({ queryKey: trackingKeys.people(userId) })
    const unsubscribers: (() => Promise<void>)[] = []
    let cancelled = false
    for (const collection of ['users', 'teams']) {
      pb.collection(collection)
        .subscribe('*', refresh)
        .then((fn) => {
          if (cancelled) void fn()
          else unsubscribers.push(fn)
        })
        .catch(() => {
          /* offline: the refetch on reconnect catches up */
        })
    }
    return () => {
      cancelled = true
      for (const fn of unsubscribers) void fn()
    }
  }, [qc, userId])

  return query
}

/** Teams the caller can report on. */
export function useMyTeams() {
  const user = useSession((s) => s.user)
  return useQuery({
    queryKey: ['tracking', 'teams', user?.id ?? ''],
    enabled: !!user,
    queryFn: () =>
      pb.collection('teams').getFullList<Team>({
        filter: user!.role === 'admin' ? '' : pb.filter('manager = {:me}', { me: user!.id }),
        sort: 'name'
      })
  })
}

/** Every visible presence record by user, kept live with a realtime subscription. */
export function usePresence() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: trackingKeys.presence,
    queryFn: async () => {
      const list = await pb.collection('presence').getFullList<PresenceRecord>()
      return Object.fromEntries(list.map((p) => [p.user, p])) as Record<string, PresenceRecord>
    }
  })

  useEffect(() => {
    let unsubscribe: (() => Promise<void>) | undefined
    let cancelled = false
    pb.collection('presence')
      .subscribe<PresenceRecord>('*', (e) => {
        qc.setQueryData<Record<string, PresenceRecord>>(trackingKeys.presence, (prev) => {
          const next = { ...(prev ?? {}) }
          if (e.action === 'delete') delete next[e.record.user]
          else next[e.record.user] = e.record
          return next
        })
      })
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
  }, [qc])

  return query
}

export interface ReportParams {
  from: string
  to: string
  group: 'day' | 'week' | 'month'
  team: string
  user: string
}

export interface ReportResponse {
  from: string
  to: string
  group: ReportParams['group']
  rows: ReportRow[]
}

export function useReport(params: ReportParams) {
  return useQuery({
    queryKey: trackingKeys.report(params),
    placeholderData: keepPreviousData,
    queryFn: () =>
      pb.send<ReportResponse>('/api/reports/activity', {
        method: 'GET',
        query: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== ''))
      })
  })
}

export function todayKey(tz: string): string {
  return toDateKey(Date.now(), tz)
}
