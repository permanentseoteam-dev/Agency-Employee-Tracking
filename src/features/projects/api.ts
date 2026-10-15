import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Employee } from '@/features/org/api'
import { call, live, must, PROFILE_WITH_TEAM, supabase, toEmployee } from '@/lib/db'
import type { TeamStatusResponse } from '@/lib/projects'

export interface Client {
  id: string
  name: string
  description: string
  archived: boolean
  members: string[]
  expand?: { members?: Employee[] }
}

export interface ProjectEvent {
  id: string
  client: string
  title: string
  starts_at: string
  ends_at: string
  description: string
  created_by: string
}

/** Approved leave of a client's people, from GET /api/projects/leaves (no leave type or reason). */
export interface TeamLeave {
  id: string
  user: string
  start_date: string
  end_date: string
  half_day: boolean
}

export const projectKeys = {
  all: ['projects'] as const,
  clients: ['projects', 'clients'] as const,
  status: (client: string, date: string) => ['projects', 'status', client, date] as const,
  events: (client: string, from: string, to: string) => ['projects', 'events', client, from, to] as const,
  leaves: (client: string, from: string, to: string) => ['projects', 'leaves', client, from, to] as const
}

/** The clients I can see (all of them for an admin), with their people. */
export function useClients() {
  return useQuery({
    queryKey: projectKeys.clients,
    queryFn: async () => {
      const clients = must(await supabase.from('clients').select('*').order('archived').order('name')) as Client[]
      const ids = [...new Set(clients.flatMap((c) => c.members))]
      const people = ids.length ? must(await supabase.from('profiles').select(PROFILE_WITH_TEAM).in('id', ids)).map((r) => toEmployee<Employee>(r)) : []
      const byId = new Map(people.map((p) => [p.id, p]))
      return clients.map((c) => ({ ...c, expand: { members: c.members.map((id) => byId.get(id)).filter((p): p is Employee => !!p) } }))
    }
  })
}

/** Each person's status on a day (live and refreshed every minute for today), plus month totals. */
export function useTeamStatus(client: string, date: string, today: boolean) {
  return useQuery({
    queryKey: projectKeys.status(client, date),
    queryFn: () => call<TeamStatusResponse>('projects-status', { client, date }),
    refetchInterval: today ? 60_000 : false,
    enabled: !!client
  })
}

/** Events overlapping [start, end) (UTC instants) on one client's calendar. */
export function useProjectEvents(client: string, start: Date, end: Date) {
  return useQuery({
    queryKey: projectKeys.events(client, start.toISOString(), end.toISOString()),
    queryFn: async () =>
      (must(
        await supabase
          .from('project_events')
          .select('*')
          .eq('client', client)
          .lt('starts_at', end.toISOString())
          .gt('ends_at', start.toISOString())
          .order('starts_at')
      ) as ProjectEvent[]).map((e) => ({ ...e, created_by: e.created_by ?? '' })),
    enabled: !!client
  })
}

export function useTeamLeaves(client: string, from: string, to: string) {
  return useQuery({
    queryKey: projectKeys.leaves(client, from, to),
    queryFn: () => call<TeamLeave[]>('projects-leaves', { client, from, to }),
    enabled: !!client
  })
}

/** Keeps the Project tab live: a client or a calendar event changed by anyone refetches. */
export function useProjectsLive() {
  const qc = useQueryClient()
  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: projectKeys.all })
    const stops = ['clients', 'project_events'].map((table) => live(table, refresh))
    return () => stops.forEach((stop) => stop())
  }, [qc])
}

export type ClientInput = Pick<Client, 'name' | 'description' | 'archived'>

export function useSaveClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: ClientInput }) =>
      (id
        ? must(await supabase.from('clients').update(data).eq('id', id).select().single())
        : must(await supabase.from('clients').insert({ ...data, members: [] }).select().single())) as Client,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('clients').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

/** Adds or removes people (admins). */
export function useChangeMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, add, remove }: { id: string; add?: string[]; remove?: string }) => {
      const current = must(await supabase.from('clients').select('members').eq('id', id).single()) as { members: string[] }
      const members = add ? [...new Set([...current.members, ...add])] : current.members.filter((m) => m !== remove)
      return must(await supabase.from('clients').update({ members }).eq('id', id).select().single()) as Client
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

export type ProjectEventData = Pick<ProjectEvent, 'title' | 'description' | 'starts_at' | 'ends_at'>

export function useSaveProjectEvent(client: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: ProjectEventData }) =>
      (id
        ? must(await supabase.from('project_events').update(data).eq('id', id).select().single())
        : must(await supabase.from('project_events').insert({ ...data, client }).select().single())) as ProjectEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

export function useDeleteProjectEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('project_events').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}
