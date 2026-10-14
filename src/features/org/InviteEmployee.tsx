import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { toDateKey } from '@/lib/dates'
import type { Role } from '@/lib/pb'
import { generateTempPassword } from '@/lib/password'
import { ROLE_LABEL, ROLES } from '@/lib/roles'
import { errorMessage } from '@/stores/session'
import { useInvite, useTeams, type InviteInput } from './api'
import { CopyButton, TempPasswordInput } from './TempPasswordInput'

const empty = (): InviteInput => ({
  full_name: '',
  email: '',
  password: generateTempPassword(),
  team: '',
  role: 'employee',
  designation: '',
  phone: '',
  joined_on: toDateKey(new Date()),
  monthly_salary_pkr: 0
})

export function InviteEmployee() {
  const navigate = useNavigate()
  const teams = useTeams()
  const invite = useInvite()
  const [form, setForm] = useState<InviteInput>(empty)
  const [salaryText, setSalaryText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; email: string; password: string; name: string } | null>(null)

  const set = <K extends keyof InviteInput>(key: K, value: InviteInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const salary = salaryText.trim() === '' ? 0 : Number(salaryText.replace(/,/g, ''))
    if (!Number.isInteger(salary) || salary < 0) {
      setError('The monthly salary must be a whole number of rupees.')
      return
    }
    try {
      const res = await invite.mutateAsync({ ...form, monthly_salary_pkr: salary })
      setCreated({ id: res.id, email: form.email.trim().toLowerCase(), password: form.password, name: form.full_name.trim() })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (created) {
    const message = `PSEO Tracker login\nEmail: ${created.email}\nTemporary password: ${created.password}\nYou'll be asked to choose your own password when you first sign in.`
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-4 py-6">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-5" aria-hidden />
            <h2 className="font-semibold">{created.name} has been added</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Share these sign-in details with them. The password is shown only now.
          </p>
          <pre className="rounded-md bg-slate-100 p-3 font-mono text-sm whitespace-pre-wrap dark:bg-slate-950">{message}</pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={message} label="Copy details" />
            <Button variant="secondary" size="sm" onClick={() => navigate(`/org/employees/${created.id}`)}>
              Open employee
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setForm(empty())
                setSalaryText('')
                setCreated(null)
              }}
            >
              Add another
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Add employee</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name" htmlFor="full_name">
              <Input id="full_name" value={form.full_name} maxLength={100} onChange={(e) => set('full_name', e.target.value)} autoFocus />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Team" htmlFor="team">
              <Select id="team" value={form.team} onChange={(e) => set('team', e.target.value)}>
                <option value="">No team</option>
                {teams.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role" htmlFor="role">
              <Select id="role" value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
                {[...ROLES].reverse().map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Designation" htmlFor="designation">
              <Input id="designation" value={form.designation} maxLength={100} onChange={(e) => set('designation', e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={form.phone} maxLength={30} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <Field label="Joining date" htmlFor="joined_on">
              <Input id="joined_on" type="date" value={form.joined_on} onChange={(e) => set('joined_on', e.target.value)} />
            </Field>
            <Field label="Monthly salary (PKR)" htmlFor="salary">
              <Input id="salary" inputMode="numeric" placeholder="e.g. 85000" value={salaryText} onChange={(e) => setSalaryText(e.target.value)} />
            </Field>
          </div>
          <Field label="Temporary password" htmlFor="password" hint="They must change it at first sign-in. At least 8 characters.">
            <TempPasswordInput id="password" value={form.password} onChange={(v) => set('password', v)} />
          </Field>
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="submit" loading={invite.isPending} disabled={!form.full_name.trim() || !form.email.trim()}>
              Add employee
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate('/org/employees')}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
