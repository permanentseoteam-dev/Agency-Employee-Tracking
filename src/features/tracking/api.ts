import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { dayRangeUtc, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { call, live, must, PROFILE_WITH_TEAM, selectAll, supabase, toEmployee } from '@/lib/db'
import type { PresenceRecord, ReportRow, SegmentRow } from '@/lib/tracking'
import { useSession } from '@/stores/session'
import { useOrgSettings } from '@/features/rules/api'
import type { Employee, Team } from '@/features/org/api'

export type TrackerStatus = Awaited<ReturnType<Window['tracker']['getStatus']>>

export const trackingKeys = {
  people: (userId: string) => ['tracking', 'people', userId] as const,
  presence: ['tracking', 'presence'] as const,
  mine: (userId: string, from: string) => ['tracking', 'mine', userId, from] as const,
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

/** My own segments from a day on (My Stats: this week and this month). */
export function useMySegments(from: string) {
  const user = useSession((s) => s.user)
  const tz = useTimezone()
  return useQuery({
    queryKey: trackingKeys.mine(user?.id ?? '', from),
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: () =>
      selectAll<SegmentRow>(() =>
        supabase
          .from('activity_segments')
          .select('state, started_at, ended_at')
          .eq('user', user!.id)
          .gte('started_at', new Date(dayRangeUtc(from, tz).start).toISOString())
          .order('started_at')
      )
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
    queryFn: async () => {
      let q = supabase.from('profiles').select(PROFILE_WITH_TEAM).eq('active', true).order('full_name')
      if (user!.role !== 'admin') {
        const teams = must(await supabase.from('teams').select('id').eq('manager', user!.id)) as { id: string }[]
        q = q.in('team', teams.map((t) => t.id))
      }
      return must(await q).map((r) => toEmployee<Employee>(r))
    }
  })

  useEffect(() => {
    if (!userId) return
    const refresh = () => void qc.invalidateQueries({ queryKey: trackingKeys.people(userId) })
    const stops = ['profiles', 'teams'].map((table) => live(table, refresh))
    return () => stops.forEach((stop) => stop())
  }, [qc, userId])

  return query
}

/** Teams the caller can report on. */
export function useMyTeams() {
  const user = useSession((s) => s.user)
  return useQuery({
    queryKey: ['tracking', 'teams', user?.id ?? ''],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('teams').select('*').order('name')
      if (user!.role !== 'admin') q = q.eq('manager', user!.id)
      return (must(await q) as Team[]).map((t) => ({ ...t, manager: t.manager ?? '' }))
    }
  })
}

/** Every visible presence record by user, kept live with a realtime subscription. */
export function usePresence() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: trackingKeys.presence,
    queryFn: async () => {
      const list = must(await supabase.from('presence').select('*')) as PresenceRecord[]
      return Object.fromEntries(list.map((p) => [p.user, p])) as Record<string, PresenceRecord>
    }
  })

  useEffect(
    () =>
      live('presence', (e) => {
        qc.setQueryData<Record<string, PresenceRecord>>(trackingKeys.presence, (prev) => {
          const next = { ...(prev ?? {}) }
          if (e.eventType === 'DELETE') delete next[e.old.user as string]
          else next[e.new.user as string] = e.new as unknown as PresenceRecord
          return next
        })
      }),
    [qc]
  )

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
    queryFn: () => call<ReportResponse>('reports-activity', Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '')))
  })
}

export function todayKey(tz: string): string {
  return toDateKey(Date.now(), tz)
}
