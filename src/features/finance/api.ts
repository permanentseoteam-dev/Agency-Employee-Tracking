import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import type { PayrollItem, PayrollRun } from '@/lib/payroll'
import type { Employee, Salary } from '@/features/org/api'

export const financeKeys = {
  all: ['finance'] as const,
  runs: ['finance', 'runs'] as const,
  run: (id: string) => ['finance', 'run', id] as const,
  items: (runId: string) => ['finance', 'items', runId] as const,
  salaries: ['finance', 'salaries'] as const
}

export type PayrollLine = PayrollItem & { expand?: { user?: Employee } }

export interface RunSummary extends PayrollRun {
  people: number
  net: number
}

/** Every run, newest month first, with its head count and total net pay. */
export function usePayrollRuns() {
  return useQuery({
    queryKey: financeKeys.runs,
    queryFn: async (): Promise<RunSummary[]> => {
      const [runs, items] = await Promise.all([
        pb.collection('payroll_runs').getFullList<PayrollRun>({ sort: '-month' }),
        pb.collection('payroll_items').getFullList<Pick<PayrollItem, 'run' | 'net'>>({ fields: 'run,net' })
      ])
      return runs.map((r) => {
        const mine = items.filter((i) => i.run === r.id)
        return { ...r, people: mine.length, net: mine.reduce((sum, i) => sum + i.net, 0) }
      })
    }
  })
}

export function usePayrollRun(id: string) {
  return useQuery({ queryKey: financeKeys.run(id), queryFn: () => pb.collection('payroll_runs').getOne<PayrollRun>(id) })
}

export function usePayrollLines(runId: string) {
  return useQuery({
    queryKey: financeKeys.items(runId),
    queryFn: async () => {
      const lines = await pb.collection('payroll_items').getFullList<PayrollLine>({ filter: pb.filter('run = {:r}', { r: runId }), expand: 'user' })
      return lines.sort((a, b) => (a.expand?.user?.full_name ?? '').localeCompare(b.expand?.user?.full_name ?? ''))
    }
  })
}

export interface RunResult {
  run: string
  month: string
  items: number
  /** Names of people employed that month who have no salary set. */
  skipped: string[]
  /** Last day whose attendance was counted ('' when none of the month has finished). */
  counted_to: string
}

/** Creates the draft for a month, or recounts an existing draft (adjustments and notes are kept). */
export function useRunPayroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (month: string) => pb.send<RunResult>('/api/payroll/run', { method: 'POST', body: { month } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

export function useUpdateLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, adjustment, note }: { id: string; adjustment: number; note: string }) =>
      pb.collection('payroll_items').update<PayrollItem>(id, { adjustment_pkr: adjustment, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

export function useFinalizeRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('payroll_runs').update<PayrollRun>(id, { status: 'finalized' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

export function useDeleteRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('payroll_runs').delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

/** Everyone with their salary record (or null when none was ever set). */
export function useSalaryTable() {
  return useQuery({
    queryKey: financeKeys.salaries,
    queryFn: async () => {
      const [people, salaries] = await Promise.all([
        pb.collection('users').getFullList<Employee>({ sort: 'full_name', expand: 'team' }),
        pb.collection('salaries').getFullList<Salary>()
      ])
      const byUser = new Map(salaries.map((s) => [s.user, s]))
      return people.map((p) => ({ person: p, salary: byUser.get(p.id) ?? null }))
    }
  })
}

export function useSaveSalaryAmount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, salary, amount }: { userId: string; salary: Salary | null; amount: number }) =>
      salary
        ? pb.collection('salaries').update(salary.id, { monthly_salary_pkr: amount })
        : pb.collection('salaries').create({ user: userId, monthly_salary_pkr: amount }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.salaries })
      void qc.invalidateQueries({ queryKey: ['org'] })
    }
  })
}
