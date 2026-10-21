import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { live, must, supabase, type OrgSettings } from '@/lib/db'
import type { RulesInput } from '@/lib/rules'
import { endIfSignInRefused } from '@/stores/session'

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
    queryFn: async () => {
      const row = (must(await supabase.from('org_settings').select('*').limit(1)) as OrgSettings[])[0] ?? null
      // Everyone signed in reads this one row: none back means the server may have ended the sign-in.
      if (!row) await endIfSignInRefused('the rules came back empty')
      return row
    },
    staleTime: 5 * 60_000
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RulesInput }) =>
      must(await supabase.from('org_settings').update(data).eq('id', id).select().single()) as OrgSettings,
    onSuccess: (saved) => qc.setQueryData(rulesKeys.settings, saved)
  })
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: rulesKeys.leaveTypes,
    queryFn: async () => must(await supabase.from('leave_types').select('*').order('name')) as LeaveType[]
  })
}

export function useSaveLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: Omit<LeaveType, 'id'> }) =>
      id
        ? must(await supabase.from('leave_types').update(data).eq('id', id).select().single())
        : must(await supabase.from('leave_types').insert(data).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: rulesKeys.leaveTypes })
  })
}

export function useDeleteLeaveType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('leave_types').delete().eq('id', id).select()),
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

  useEffect(
    () =>
      live('org_settings', (e) => {
        if (e.eventType === 'UPDATE' || e.eventType === 'INSERT') qc.setQueryData(rulesKeys.settings, e.new as unknown as OrgSettings)
      }),
    [qc]
  )

  useEffect(() => {
    if (settings.data) window.tracker.setSettings(settings.data)
  }, [settings.data])

  return null
}
