import { useMemo, useState, type FormEvent } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import type { Employee, Salary } from '@/features/org/api'
import { formatPkr } from '@/lib/payroll'
import { ROLE_LABEL } from '@/lib/roles'
import { errorMessage } from '@/stores/session'
import { useSalaryTable, useSaveSalaryAmount } from './api'

export function SalarySetup() {
  const table = useSalaryTable()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (table.data ?? []).filter(
      ({ person }) => (showInactive || person.active) && (!q || `${person.full_name} ${person.email ?? ''}`.toLowerCase().includes(q))
    )
  }, [table.data, search, showInactive])

  const active = (table.data ?? []).filter((r) => r.person.active)
  const total = active.reduce((sum, r) => sum + (r.salary?.monthly_salary_pkr ?? 0), 0)
  const missing = active.filter((r) => !r.salary?.monthly_salary_pkr).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input aria-label="Search employees" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input type="checkbox" className="size-4 accent-indigo-600" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show former employees
        </label>
        <p className="ml-auto text-sm text-slate-600 dark:text-slate-400">
          Monthly salaries, active staff: <span className="font-semibold text-slate-900 dark:text-slate-100" data-salary-total>{formatPkr(total)}</span>
        </p>
      </div>
      {missing > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {missing} active {missing === 1 ? 'person has' : 'people have'} no salary set and will be left out of payroll.
        </p>
      )}
      <Card>
        {table.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : table.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load salaries.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nobody matches.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Team</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th className="w-80">Monthly salary (PKR)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ person, salary }) => (
                <SalaryRow key={person.id} person={person} salary={salary} />
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">Changes apply to the next payroll run; finalized months keep the salary they were run with.</p>
    </div>
  )
}

function SalaryRow({ person, salary }: { person: Employee; salary: Salary | null }) {
  const save = useSaveSalaryAmount()
  const saved = String(salary?.monthly_salary_pkr ?? '')
  const [text, setText] = useState(saved)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = text.trim() !== saved

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const amount = Number(text.replace(/,/g, '').trim())
    if (!Number.isInteger(amount) || amount < 0) return setStatus({ ok: false, text: 'Whole rupees, 0 or more.' })
    try {
      await save.mutateAsync({ userId: person.id, salary, amount })
      setText(String(amount))
      setStatus({ ok: true, text: 'Saved' })
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err, 'Could not save.') })
    }
  }

  return (
    <tr data-person={person.id}>
      <Td>
        <span className="block font-medium text-slate-900 dark:text-slate-100">{person.full_name || '(no name)'}</span>
        <span className="block text-xs text-slate-500">{person.email}</span>
      </Td>
      <Td>{person.expand?.team?.name ?? <span className="text-slate-400">—</span>}</Td>
      <Td>
        {ROLE_LABEL[person.role]} {!person.active && <Badge className="ml-1">Left {person.left_on}</Badge>}
      </Td>
      <Td className="tabular-nums">{person.joined_on || <span className="text-slate-400">—</span>}</Td>
      <Td>
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <Input
            aria-label={`Monthly salary for ${person.full_name}`}
            inputMode="numeric"
            value={text}
            placeholder="Not set"
            onChange={(e) => {
              setText(e.target.value)
              setStatus(null)
            }}
            className="h-9 w-36 text-right tabular-nums"
          />
          {dirty ? (
            <Button type="submit" size="sm" loading={save.isPending}>
              Save
            </Button>
          ) : status ? (
            <span className={status.ok ? 'text-xs text-emerald-700 dark:text-emerald-400' : 'text-xs text-red-600'}>{status.text}</span>
          ) : null}
          {dirty && status && !status.ok && <span className="text-xs text-red-600">{status.text}</span>}
        </form>
      </Td>
    </tr>
  )
}
