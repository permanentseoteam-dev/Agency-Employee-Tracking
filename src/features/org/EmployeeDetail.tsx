import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, UserCheck, UserX } from 'lucide-react'
import { Avatar } from '@/components/layout/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { toDateKey } from '@/lib/dates'
import type { Role } from '@/lib/pb'
import { generateTempPassword } from '@/lib/password'
import { ROLE_LABEL, ROLES } from '@/lib/roles'
import { errorMessage, useSession } from '@/stores/session'
import {
  formatPkr,
  useEmployee,
  useResetPassword,
  useSalary,
  useSaveSalary,
  useSetActive,
  useTeams,
  useUpdateEmployee,
  type Employee
} from './api'
import { CopyButton, TempPasswordInput } from './TempPasswordInput'

export function EmployeeDetail() {
  const { id = '' } = useParams()
  const employee = useEmployee(id)

  if (employee.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (employee.isError || !employee.data) {
    return (
      <p className="text-sm text-red-600">
        Employee not found. <Link to="/org/employees" className="underline">Back to employees</Link>
      </p>
    )
  }
  return <EmployeeView employee={employee.data} />
}

function EmployeeView({ employee }: { employee: Employee }) {
  const me = useSession((s) => s.user)!
  const isSelf = me.id === employee.id

  return (
    <div className="space-y-6">
      <Link to="/org/employees" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="size-4" aria-hidden /> Employees
      </Link>
      <div className="flex items-center gap-4">
        <Avatar user={employee} size={56} />
        <div>
          <h2 className="text-xl font-semibold">{employee.full_name || '(no name)'}</h2>
          <p className="text-sm text-slate-500">
            {employee.email} · {ROLE_LABEL[employee.role]}
            {employee.expand?.team ? ` · ${employee.expand.team.name}` : ''}
          </p>
        </div>
        <div className="ml-auto">
          {employee.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive since {employee.left_on || '—'}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailsCard employee={employee} isSelf={isSelf} />
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Attendance this month</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-500">Shown here once attendance is built (M7).</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leave balance</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-500">Shown here once leave is built (M8).</CardContent>
            </Card>
          </div>
        </div>
        <div className="space-y-6">
          <SalaryCard employee={employee} />
          <AccountCard employee={employee} isSelf={isSelf} />
        </div>
      </div>
    </div>
  )
}

function DetailsCard({ employee, isSelf }: { employee: Employee; isSelf: boolean }) {
  const teams = useTeams()
  const update = useUpdateEmployee()
  const initial = () => ({
    full_name: employee.full_name,
    email: employee.email ?? '',
    designation: employee.designation,
    phone: employee.phone,
    team: employee.team,
    role: employee.role,
    joined_on: employee.joined_on
  })
  const [form, setForm] = useState(initial)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => setForm(initial()), [employee.updated]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof ReturnType<typeof initial>, value: string) => setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    if (!form.full_name.trim()) return setStatus({ ok: false, text: 'Name cannot be empty.' })
    const data: Record<string, string> = {
      full_name: form.full_name.trim(),
      designation: form.designation.trim(),
      phone: form.phone.trim(),
      team: form.team,
      joined_on: form.joined_on
    }
    if (!isSelf) data.role = form.role
    if (form.email.trim().toLowerCase() !== (employee.email ?? '')) data.email = form.email.trim().toLowerCase()
    try {
      await update.mutateAsync({ id: employee.id, data })
      setStatus({ ok: true, text: 'Saved.' })
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name" htmlFor="d_full_name">
              <Input id="d_full_name" value={form.full_name} maxLength={100} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="d_email">
              <Input id="d_email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Team" htmlFor="d_team">
              <Select id="d_team" value={form.team} onChange={(e) => set('team', e.target.value)}>
                <option value="">No team</option>
                {teams.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role" htmlFor="d_role" hint={isSelf ? 'You cannot change your own role.' : undefined}>
              <Select id="d_role" value={form.role} disabled={isSelf} onChange={(e) => set('role', e.target.value as Role)}>
                {[...ROLES].reverse().map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Designation" htmlFor="d_designation">
              <Input id="d_designation" value={form.designation} maxLength={100} onChange={(e) => set('designation', e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="d_phone">
              <Input id="d_phone" value={form.phone} maxLength={30} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Joining date" htmlFor="d_joined_on">
              <Input id="d_joined_on" type="date" value={form.joined_on} onChange={(e) => set('joined_on', e.target.value)} />
            </Field>
          </div>
          {status && (
            <p role="status" className={status.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-600'}>
              {status.text}
            </p>
          )}
          <Button type="submit" loading={update.isPending}>
            Save details
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function SalaryCard({ employee }: { employee: Employee }) {
  const salary = useSalary(employee.id)
  const save = useSaveSalary()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (salary.data !== undefined) setText(String(salary.data?.monthly_salary_pkr ?? 0))
  }, [salary.data])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    const amount = Number(text.replace(/,/g, ''))
    if (!Number.isInteger(amount) || amount < 0) return setStatus({ ok: false, text: 'Enter a whole number of rupees.' })
    try {
      await save.mutateAsync({ userId: employee.id, salary: salary.data ?? null, amount })
      setStatus({ ok: true, text: 'Salary saved.' })
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Salary</CardTitle>
      </CardHeader>
      <CardContent>
        {salary.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <p className="text-2xl font-semibold">{formatPkr(salary.data?.monthly_salary_pkr)}</p>
            <Field label="Monthly salary (PKR)" htmlFor="s_amount">
              <Input id="s_amount" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            {status && (
              <p role="status" className={status.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-600'}>
                {status.text}
              </p>
            )}
            <Button type="submit" size="sm" loading={save.isPending}>
              Save salary
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function AccountCard({ employee, isSelf }: { employee: Employee; isSelf: boolean }) {
  const reset = useResetPassword()
  const setActive = useSetActive()
  const [resetOpen, setResetOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [resetDone, setResetDone] = useState<string | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leftOn, setLeftOn] = useState(toDateKey(new Date()))
  const [error, setError] = useState<string | null>(null)

  async function doReset(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await reset.mutateAsync({ userId: employee.id, password })
      setResetDone(password)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function doDeactivate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await setActive.mutateAsync({ userId: employee.id, active: false, left_on: leftOn })
      setLeaveOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            setPassword(generateTempPassword())
            setResetDone(null)
            setError(null)
            setResetOpen(true)
          }}
        >
          <KeyRound className="size-4" aria-hidden /> Reset password
        </Button>
        {employee.active ? (
          <Button
            variant="danger"
            className="w-full"
            disabled={isSelf}
            title={isSelf ? 'You cannot deactivate your own account' : undefined}
            onClick={() => {
              setError(null)
              setLeaveOpen(true)
            }}
          >
            <UserX className="size-4" aria-hidden /> Deactivate
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            loading={setActive.isPending}
            onClick={() => void setActive.mutateAsync({ userId: employee.id, active: true }).catch((err) => setError(errorMessage(err)))}
          >
            <UserCheck className="size-4" aria-hidden /> Reactivate
          </Button>
        )}
        <FormError message={!resetOpen && !leaveOpen ? error : null} />
        <p className="text-xs text-slate-500">Deactivated people can’t sign in. Their history stays for reports and payroll.</p>
      </CardContent>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} title={`Reset password for ${employee.full_name}`}>
        {resetDone ? (
          <div className="space-y-4 text-sm">
            <p>The new temporary password is below. They must choose their own at the next sign-in, and they have been signed out everywhere.</p>
            <pre className="rounded-md bg-slate-100 p-3 font-mono dark:bg-slate-950">{resetDone}</pre>
            <div className="flex gap-2">
              <CopyButton text={resetDone} />
              <Button size="sm" onClick={() => setResetOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={doReset} className="space-y-4">
            <Field label="New temporary password" htmlFor="r_password" hint="At least 8 characters.">
              <TempPasswordInput id="r_password" value={password} onChange={setPassword} />
            </Field>
            <FormError message={error} />
            <div className="flex gap-2">
              <Button type="submit" loading={reset.isPending}>
                Reset password
              </Button>
              <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} title={`Deactivate ${employee.full_name}`}>
        <form onSubmit={doDeactivate} className="space-y-4 text-sm">
          <p>They will be signed out at once and can’t sign in again until reactivated.</p>
          <Field label="Last working day" htmlFor="left_on">
            <Input id="left_on" type="date" value={leftOn} onChange={(e) => setLeftOn(e.target.value)} />
          </Field>
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={setActive.isPending}>
              Deactivate
            </Button>
            <Button type="button" variant="ghost" onClick={() => setLeaveOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  )
}
