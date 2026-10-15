import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Employee } from '@/features/org/api'
import { pb } from '@/lib/pb'
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
    queryFn: () => pb.collection('clients').getFullList<Client>({ sort: 'archived,name', expand: 'members,members.team' })
  })
}

/** Each person's status on a day (live and refreshed every minute for today), plus month totals. */
export function useTeamStatus(client: string, date: string, today: boolean) {
  return useQuery({
    queryKey: projectKeys.status(client, date),
    queryFn: () => pb.send<TeamStatusResponse>('/api/projects/status', { query: { client, date } }),
    refetchInterval: today ? 60_000 : false,
    enabled: !!client
  })
}

/** Events overlapping [start, end) (UTC instants) on one client's calendar. */
export function useProjectEvents(client: string, start: Date, end: Date) {
  return useQuery({
    queryKey: projectKeys.events(client, start.toISOString(), end.toISOString()),
    queryFn: () =>
      pb.collection('project_events').getFullList<ProjectEvent>({
        filter: pb.filter('client = {:client} && starts_at < {:end} && ends_at > {:start}', { client, start, end }),
        sort: 'starts_at'
      }),
    enabled: !!client
  })
}

export function useTeamLeaves(client: string, from: string, to: string) {
  return useQuery({
    queryKey: projectKeys.leaves(client, from, to),
    queryFn: () => pb.send<TeamLeave[]>('/api/projects/leaves', { query: { client, from, to } }),
    enabled: !!client
  })
}

/** Keeps the Project tab live: a client or a calendar event changed by anyone refetches. */
export function useProjectsLive() {
  const qc = useQueryClient()
  useEffect(() => {
    const stops: (() => Promise<void>)[] = []
    let cancelled = false
    const refresh = () => void qc.invalidateQueries({ queryKey: projectKeys.all })
    for (const name of ['clients', 'project_events']) {
      pb.collection(name)
        .subscribe('*', refresh)
        .then((stop) => {
          if (cancelled) void stop()
          else stops.push(stop)
        })
        .catch(() => {
          /* offline: the next refetch catches up */
        })
    }
    return () => {
      cancelled = true
      for (const stop of stops) void stop()
    }
  }, [qc])
}

export type ClientInput = Pick<Client, 'name' | 'description' | 'archived'>

export function useSaveClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: ClientInput }) =>
      id ? pb.collection('clients').update<Client>(id, data) : pb.collection('clients').create<Client>({ ...data, members: [] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('clients').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

/** Adds or removes people (admins). */
export function useChangeMembers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, add, remove }: { id: string; add?: string[]; remove?: string }) =>
      pb.collection('clients').update<Client>(id, add ? { 'members+': add } : { 'members-': remove }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

export type ProjectEventData = Pick<ProjectEvent, 'title' | 'description' | 'starts_at' | 'ends_at'>

export function useSaveProjectEvent(client: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: ProjectEventData }) =>
      id ? pb.collection('project_events').update<ProjectEvent>(id, data) : pb.collection('project_events').create<ProjectEvent>({ ...data, client }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}

export function useDeleteProjectEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('project_events').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all })
  })
}
