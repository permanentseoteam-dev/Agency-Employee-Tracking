import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call, must, PROFILE_WITH_TEAM, selectAll, supabase, toEmployee } from '@/lib/db'
import type { PayrollItem, PayrollRun } from '@/lib/payroll'
import type { Employee, Salary } from '@/features/org/api'

export const financeKeys = {
  all: ['finance'] as const,
  runs: ['finance', 'runs'] as const,
  run: (id: string) => ['finance', 'run', id] as const,
  items: (runId: string) => ['finance', 'items', runId] as const,
  salaries: ['finance', 'salaries'] as const,
  mine: (userId: string) => ['finance', 'mine', userId] as const
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
        supabase.from('payroll_runs').select('*').order('month', { ascending: false }).then((r) => must(r) as PayrollRun[]),
        selectAll<Pick<PayrollItem, 'run' | 'net'>>(() => supabase.from('payroll_items').select('run, net').order('id'))
      ])
      return runs.map((r) => {
        const mine = items.filter((i) => i.run === r.id)
        return { ...r, people: mine.length, net: mine.reduce((sum, i) => sum + i.net, 0) }
      })
    }
  })
}

export function usePayrollRun(id: string) {
  return useQuery({ queryKey: financeKeys.run(id), queryFn: async () => must(await supabase.from('payroll_runs').select('*').eq('id', id).single()) as PayrollRun })
}

export function usePayrollLines(runId: string) {
  return useQuery({
    queryKey: financeKeys.items(runId),
    queryFn: async () => {
      const rows = must(await supabase.from('payroll_items').select('*, user_row:profiles!payroll_items_user_fkey(*)').eq('run', runId)) as (PayrollItem & { user_row?: Record<string, unknown> | null })[]
      const lines: PayrollLine[] = rows.map(({ user_row, ...l }) => ({ ...l, expand: user_row ? { user: toEmployee<Employee>(user_row) } : {} }))
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
    mutationFn: (month: string) => call<RunResult>('payroll-run', { month }),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

export function useUpdateLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, adjustment, note }: { id: string; adjustment: number; note: string }) =>
      must(await supabase.from('payroll_items').update({ adjustment_pkr: adjustment, note }).eq('id', id).select().single()) as PayrollItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

export function useFinalizeRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('payroll_runs').update({ status: 'finalized' }).eq('id', id).select().single()) as PayrollRun,
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

export function useDeleteRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('payroll_runs').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.all })
  })
}

export type MyPayLine = PayrollLine & { expand?: { run?: PayrollRun } }

/** One person's salary and their lines in finalized months, newest first (read-only for non-admins). */
export function useMyPay(userId: string) {
  return useQuery({
    queryKey: financeKeys.mine(userId),
    queryFn: async () => {
      const [salary, rows] = await Promise.all([
        supabase.from('salaries').select('*').eq('user', userId).maybeSingle(),
        supabase
          .from('payroll_items')
          .select('*, run_row:payroll_runs!inner(*), user_row:profiles!payroll_items_user_fkey(*)')
          .eq('user', userId)
          .eq('run_row.status', 'finalized')
      ])
      const lines: MyPayLine[] = (must(rows) as (PayrollItem & { run_row: PayrollRun; user_row?: Record<string, unknown> | null })[]).map(
        ({ run_row, user_row, ...l }) => ({ ...l, expand: { run: run_row, ...(user_row ? { user: toEmployee<Employee>(user_row) } : {}) } })
      )
      const month = (l: MyPayLine) => l.expand?.run?.month ?? ''
      return { salary: (must(salary) as Salary | null) ?? null, lines: lines.sort((a, b) => month(b).localeCompare(month(a))) }
    }
  })
}

/** Everyone with their salary record (or null when none was ever set). */
export function useSalaryTable() {
  return useQuery({
    queryKey: financeKeys.salaries,
    queryFn: async () => {
      const [peopleRows, salaries] = await Promise.all([
        supabase.from('profiles').select(PROFILE_WITH_TEAM).order('full_name').then((r) => must(r)),
        supabase.from('salaries').select('*').then((r) => must(r) as Salary[])
      ])
      const people = peopleRows.map((r) => toEmployee<Employee>(r))
      const byUser = new Map(salaries.map((s) => [s.user, s]))
      return people.map((p) => ({ person: p, salary: byUser.get(p.id) ?? null }))
    }
  })
}

export function useSaveSalaryAmount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, salary, amount }: { userId: string; salary: Salary | null; amount: number }) =>
      salary
        ? must(await supabase.from('salaries').update({ monthly_salary_pkr: amount }).eq('id', salary.id).select().single())
        : must(await supabase.from('salaries').insert({ user: userId, monthly_salary_pkr: amount }).select().single()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: financeKeys.salaries })
      void qc.invalidateQueries({ queryKey: ['org'] })
    }
  })
}
