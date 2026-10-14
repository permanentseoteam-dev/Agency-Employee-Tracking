import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb, type Role, type UserRecord } from '@/lib/pb'

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
    queryFn: () => pb.collection('teams').getFullList<Team>({ sort: 'name', expand: 'manager' })
  })
}

export function useEmployees() {
  return useQuery({
    queryKey: orgKeys.employees,
    queryFn: () => pb.collection('users').getFullList<Employee>({ sort: 'full_name', expand: 'team' })
  })
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: orgKeys.employee(id),
    queryFn: () => pb.collection('users').getOne<Employee>(id, { expand: 'team' })
  })
}

export function useSalary(userId: string) {
  return useQuery({
    queryKey: orgKeys.salary(userId),
    queryFn: async () => {
      const list = await pb.collection('salaries').getList<Salary>(1, 1, { filter: pb.filter('user = {:u}', { u: userId }) })
      return list.items[0] ?? null
    }
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
    mutationFn: (input: InviteInput) => pb.send<{ id: string }>('/api/org/invite', { method: 'POST', body: input }),
    onSuccess: invalidate
  })
}

export function useUpdateEmployee() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserRecord> }) => pb.collection('users').update(id, data),
    onSuccess: invalidate
  })
}

export function useSaveSalary() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: ({ userId, salary, amount }: { userId: string; salary: Salary | null; amount: number }) =>
      salary
        ? pb.collection('salaries').update(salary.id, { monthly_salary_pkr: amount })
        : pb.collection('salaries').create({ user: userId, monthly_salary_pkr: amount }),
    onSuccess: invalidate
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      pb.send('/api/org/reset-password', { method: 'POST', body: { userId, password } })
  })
}

export function useSetActive() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: (body: { userId: string; active: boolean; left_on?: string }) =>
      pb.send('/api/org/set-active', { method: 'POST', body }),
    onSuccess: invalidate
  })
}

export function useSaveTeam() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: ({ id, name, manager }: { id?: string; name: string; manager: string }) =>
      id ? pb.collection('teams').update(id, { name, manager }) : pb.collection('teams').create({ name, manager }),
    onSuccess: invalidate
  })
}

export function useDeleteTeam() {
  const invalidate = useOrgInvalidate()
  return useMutation({
    mutationFn: (id: string) => pb.collection('teams').delete(id),
    onSuccess: invalidate
  })
}

export function formatPkr(amount: number | undefined | null): string {
  return `PKR ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(amount ?? 0)}`
}
