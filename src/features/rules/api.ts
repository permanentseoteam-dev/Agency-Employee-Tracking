import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb, type OrgSettings } from '@/lib/pb'
import type { RulesInput } from '@/lib/rules'

export interface LeaveType {
  id: string
  name: string
  yearly_quota_days: number
  paid: boolean
}

export const rulesKeys = {
  settings: ['rules', 'settings'] as const,
  leaveTypes: ['rules', 'leave-types'] as const
}

/** The single org_settings record (created by the seed migration). */
export function useOrgSettings() {
  return useQuery({
    queryKey: rulesKeys.settings,
    queryFn: async () => (await pb.collection('org_settings').getFullList<OrgSettings>({ requestKey: null }))[0] ?? null,
    staleTime: 5 * 60_000
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RulesInput }) =>
      pb.collection('org_settings').update<OrgSettings>(id, data),
    onSuccess: (saved) => qc.setQueryData(rulesKeys.settings, saved)
  })
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: rulesKeys.leaveTypes,
    queryFn: () => pb.collection('leave_types').getFullList<LeaveType>({ sort: 'name' })
  })
}

export function useSaveLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Omit<LeaveType, 'id'> }) =>
      id ? pb.collection('leave_types').update(id, data) : pb.collection('leave_types').create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKeys.leaveTypes })
  })
}

export function useDeleteLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('leave_types').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKeys.leaveTypes })
  })
}

/**
 * Keeps the rules fresh for everyone signed in: follows live changes to
 * org_settings and hands the current rules to the main process (the tracker
 * reads the idle threshold, shift and working days from there). Mount once.
 */
export function SettingsSync() {
  const qc = useQueryClient()
  const settings = useOrgSettings()

  useEffect(() => {
    let unsubscribe: (() => Promise<void>) | undefined
    let cancelled = false
    pb.collection('org_settings')
      .subscribe<OrgSettings>('*', (e) => {
        if (e.action === 'update' || e.action === 'create') qc.setQueryData(rulesKeys.settings, e.record)
      })
      .then((fn) => {
        if (cancelled) void fn()
        else unsubscribe = fn
      })
      .catch(() => {
        /* offline: the next refetch picks changes up */
      })
    return () => {
      cancelled = true
      void unsubscribe?.()
    }
  }, [qc])

  useEffect(() => {
    if (settings.data) window.tracker.setSettings(settings.data)
  }, [settings.data])

  return null
}
