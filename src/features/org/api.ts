import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call, live, must, PROFILE_WITH_TEAM, supabase, toEmployee, toUser, type Role, type UserRecord } from '@/lib/db'

export interface Team {
  id: string
  name: string
  manager: string
  expand?: { manager?: UserRecord }
}

export type Employee = UserRecord & { expand?: { team?: Team } }

export interface Salary {
  id: string
  user: string
  monthly_salary_pkr: number
}

export interface InviteInput {
  full_name: string
  email: string
  password: string
  team: string
  role: Role
  designation: string
  phone: string
  joined_on: string
  monthly_salary_pkr: number
}

export const orgKeys = {
  teams: ['org', 'teams'] as const,
  employees: ['org', 'employees'] as const,
  employee: (id: string) => ['org', 'employee', id] as const,
  salary: (userId: string) => ['org', 'salary', userId] as const
}

export function useTeams() {
  return useQuery({
    queryKey: orgKeys.teams,
    queryFn: async () => {
      const rows = must(await supabase.from('teams').select('*, manager_row:profiles!teams_manager_fkey(*)').order('name'))
      return rows.map(({ manager_row, ...t }) => ({
        ...(t as Team),
        manager: t.manager ?? '',
        expand: manager_row ? { manager: toUser(manager_row) } : {}
      })) as Team[]
    }
  })
}

export function useEmployees() {
  return useQuery({
    queryKey: orgKeys.employees,
    queryFn: async () => must(await supabase.from('profiles').select(PROFILE_WITH_TEAM).order('full_name')).map((r) => toEmployee<Employee>(r))
  })
}

/** Keeps Organization's lists live: a sign-up or any change to an account refetches them. */
export function useOrgLive() {
  const qc = useQueryClient()
  useEffect(() => live('profiles', () => void qc.invalidateQueries({ queryKey: ['org'] })), [qc])
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: orgKeys.employee(id),
    queryFn: async () => toEmployee<Employee>(must(await supabase.from('profiles').select(PROFILE_WITH_TEAM).eq('id', id).single()))
  })
}

export function useSalary(userId: string) {
  return useQuery({
    queryKey: orgKeys.salary(userId),
    queryFn: async () => (must(await supabase.from('salaries').select('*').eq('user', userId).maybeSingle()) as Salary | null) ?? null
  })
}

/** Invalidates everything under the org key after a change. */
function useOrgInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['org'] })
}

export function useInvite() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: (input: InviteInput) => call<{ id: string }>('org', { action: 'invite', ...input }),
    onSuccess: invalidate
  })
}

export function useUpdateEmployee() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserRecord> }) => {
      const { email: _email, expand: _expand, ...fields } = data as Partial<UserRecord> & { expand?: unknown }
      const row = { ...fields, ...('team' in fields ? { team: fields.team || null } : {}) }
      return must(await supabase.from('profiles').update(row).eq('id', id).select().single())
    },
    onSuccess: invalidate
  })
}

export function useSaveSalary() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: async ({ userId, salary, amount }: { userId: string; salary: Salary | null; amount: number }) =>
      salary
        ? must(await supabase.from('salaries').update({ monthly_salary_pkr: amount }).eq('id', salary.id).select().single())
        : must(await supabase.from('salaries').insert({ user: userId, monthly_salary_pkr: amount }).select().single()),
    onSuccess: invalidate
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) => call('org', { action: 'reset-password', userId, password })
  })
}

export function useSetActive() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: (body: { userId: string; active: boolean; left_on?: string }) => call('org', { action: 'set-active', ...body }),
    onSuccess: invalidate
  })
}

/** Approve a sign-up from Create an account (switches it on, joined today). */
export function useApproveSignup() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: (userId: string) => call('org', { action: 'approve', userId }),
    onSuccess: invalidate
  })
}

/** Reject a sign-up: the account is deleted. */
export function useRejectSignup() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: (userId: string) => call('org', { action: 'reject', userId }),
    onSuccess: invalidate
  })
}

export function useSaveTeam() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: async ({ id, name, manager }: { id?: string; name: string; manager: string }) => {
      const row = { name, manager: manager || null }
      return id
        ? must(await supabase.from('teams').update(row).eq('id', id).select().single())
        : must(await supabase.from('teams').insert(row).select().single())
    },
    onSuccess: invalidate
  })
}

export function useDeleteTeam() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('teams').delete().eq('id', id).select()),
    onSuccess: invalidate
  })
}

export function formatPkr(amount: number | undefined | null): string {
  return `PKR ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(amount ?? 0)}`
}
