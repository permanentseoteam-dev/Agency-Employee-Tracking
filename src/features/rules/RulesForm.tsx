import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { cn } from '@/lib/cn'
import type { OrgSettings } from '@/lib/db'
import { payRates } from '@/lib/pay'
import { formatPay } from '@/lib/payroll'
import { shiftHours, validateRules, WEEKDAYS, type RulesErrors, type RulesInput } from '@/lib/rules'
import { errorMessage, useSession } from '@/stores/session'
import { useOrgSettings, useSaveSettings } from './api'

/** Number inputs are kept as text while typing, then parsed on save. */
interface FormState {
  shift_start: string
  shift_end: string
  work_days: number[]
  grace_minutes: string
  /** The daily target in hours (stored as minutes). */
  required_hours: string
  star_block_minutes: string
  star_value_mode: OrgSettings['star_value_mode']
  star_value_pkr: string
  idle_threshold_minutes: string
  monthly_full_leaves: string
  monthly_half_leaves: string
}

function toForm(s: OrgSettings): FormState {
  return {
    shift_start: s.shift_start,
    shift_end: s.shift_end,
    work_days: [...s.work_days].sort(),
    grace_minutes: String(s.grace_minutes),
    required_hours: String((s.required_daily_minutes ?? 360) / 60),
    star_block_minutes: String(s.star_block_minutes ?? 30),
    star_value_mode: s.star_value_mode ?? 'half_hour_pay',
    star_value_pkr: String(s.star_value_pkr ?? 0),
    idle_threshold_minutes: String(s.idle_threshold_minutes),
    monthly_full_leaves: String(s.monthly_full_leaves ?? 0),
    monthly_half_leaves: String(s.monthly_half_leaves ?? 0)
  }
}

function toInput(f: FormState, s: OrgSettings): RulesInput {
  const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(/,/g, '')))
  const fixed = f.star_value_mode === 'fixed_pkr'
  return {
    shift_start: f.shift_start,
    shift_end: f.shift_end,
    work_days: [...f.work_days].sort(),
    grace_minutes: num(f.grace_minutes),
    // No longer edited: passed through unchanged.
    full_day_min_hours: s.full_day_min_hours,
    half_day_min_hours: s.half_day_min_hours,
    required_daily_minutes: Math.round(num(f.required_hours) * 60),
    star_block_minutes: num(f.star_block_minutes),
    star_value_mode: f.star_value_mode,
    star_value_pkr: fixed ? num(f.star_value_pkr) : (s.star_value_pkr ?? 0),
    idle_threshold_minutes: num(f.idle_threshold_minutes),
    monthly_full_leaves: num(f.monthly_full_leaves),
    monthly_half_leaves: num(f.monthly_half_leaves),
    timezone: s.timezone
  }
}

/** What one star costs on an example salary, from the form as typed: "PKR 378.79", or '' while invalid. */
function exampleStar(f: FormState): string {
  const hours = Number(f.required_hours)
  const block = Number(f.star_block_minutes)
  if (f.star_value_mode === 'fixed_pkr') return ''
  if (!(hours > 0) || !(block > 0)) return ''
  return formatPay(payRates(100000, 22, { required_daily_minutes: hours * 60, star_block_minutes: block }).star_value)
}

export function RulesForm() {
  const settings = useOrgSettings()
  if (settings.isLoading) return <p className="text-sm text-slate-500">Loading rules…</p>
  if (!settings.data) return <p className="text-sm text-red-600">The rules record is missing. Re-run the seed migration.</p>
  return <RulesEditor settings={settings.data} />
}

function RulesEditor({ settings }: { settings: OrgSettings }) {
  // Everyone can read the rules; only an admin changes them (the server enforces the same).
  const readOnly = useSession((s) => s.user?.role) !== 'admin'
  const save = useSaveSettings()
  const [form, setForm] = useState(() => toForm(settings))
  const [errors, setErrors] = useState<RulesErrors>({})
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  // Another admin saved while this form was open: take their values.
  useEffect(() => setForm(toForm(settings)), [settings.updated]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const toggleDay = (iso: number) =>
    set('work_days', form.work_days.includes(iso) ? form.work_days.filter((d) => d !== iso) : [...form.work_days, iso].sort())

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus(null)
    const input = toInput(form, settings)
    const problems = validateRules(input)
    setErrors(problems)
    if (Object.keys(problems).length) {
      setStatus({ ok: false, text: 'Fix the highlighted fields.' })
      return
    }
    try {
      await save.mutateAsync({ id: settings.id, data: input })
      setStatus({ ok: true, text: 'Rules saved. They apply to everyone straight away.' })
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) })
    }
  }

  const length = /^\d{2}:\d{2}$/.test(form.shift_start) && /^\d{2}:\d{2}$/.test(form.shift_end) ? shiftHours(form.shift_start, form.shift_end) : null

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {readOnly && <ReadOnlyNote />}
      <fieldset disabled={readOnly} className="space-y-6">
        <Section title="Shift" description="Tracking runs only inside these hours on working days. Times are Pakistan time.">
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
            <Field label="Shift starts" htmlFor="shift_start" error={errors.shift_start}>
              <Input id="shift_start" type="time" value={form.shift_start} onChange={(e) => set('shift_start', e.target.value)} />
            </Field>
            <Field label="Shift ends" htmlFor="shift_end" error={errors.shift_end}>
              <Input id="shift_end" type="time" value={form.shift_end} onChange={(e) => set('shift_end', e.target.value)} />
            </Field>
            <div className="self-end pb-2 text-sm text-slate-500">{length !== null && length > 0 ? `${length} hour shift` : ''}</div>
          </div>
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Working days</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
              {WEEKDAYS.map((d) => {
                const on = form.work_days.includes(d.iso)
                return (
                  <button
                    key={d.iso}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(d.iso)}
                    className={cn(
                      'h-9 w-14 rounded-md border text-sm font-medium',
                      on
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    )}
                  >
                    {d.short}
                  </button>
                )
              })}
            </div>
            {errors.work_days && <p className="mt-1 text-xs text-red-600">{errors.work_days}</p>}
          </div>
        </Section>

        <Section
          title="Attendance and stars"
          description="Each started star block late, or short of the daily target, is a star. Every star takes its value off that day's pay."
        >
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
            <Field label="Grace period (minutes)" htmlFor="grace_minutes" error={errors.grace_minutes} hint="First activity after shift start + grace = Late.">
              <Input id="grace_minutes" inputMode="numeric" value={form.grace_minutes} onChange={(e) => set('grace_minutes', e.target.value)} />
            </Field>
            <Field
              label="Daily target (hours active)"
              htmlFor="required_hours"
              error={errors.required_daily_minutes}
              hint="Everyone must be active this long on a working day."
            >
              <Input id="required_hours" inputMode="decimal" value={form.required_hours} onChange={(e) => set('required_hours', e.target.value)} />
            </Field>
            <Field label="One star per (minutes)" htmlFor="star_block_minutes" error={errors.star_block_minutes} hint="1–30 minutes late or short = 1 star at 30.">
              <Input id="star_block_minutes" inputMode="numeric" value={form.star_block_minutes} onChange={(e) => set('star_block_minutes', e.target.value)} />
            </Field>
            <Field
              label="A star costs"
              htmlFor="star_value_mode"
              error={errors.star_value_mode}
              hint={exampleStar(form) && `About ${exampleStar(form)} on a 100,000 salary with 22 working days.`}
            >
              <select
                id="star_value_mode"
                value={form.star_value_mode}
                onChange={(e) => set('star_value_mode', e.target.value as FormState['star_value_mode'])}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="half_hour_pay">The pay for one star block of time</option>
                <option value="fixed_pkr">A fixed amount</option>
              </select>
            </Field>
            {form.star_value_mode === 'fixed_pkr' && (
              <Field label="Amount per star (PKR)" htmlFor="star_value_pkr" error={errors.star_value_pkr} hint="The same for everyone, whatever the salary.">
                <Input id="star_value_pkr" inputMode="decimal" value={form.star_value_pkr} onChange={(e) => set('star_value_pkr', e.target.value)} />
              </Field>
            )}
          </div>
        </Section>

        <Section title="Leaves per month" description="Most leave one person can take in a calendar month, any leave type. The yearly days per leave type still apply.">
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
            <Field label="Full-day leaves" htmlFor="monthly_full_leaves" error={errors.monthly_full_leaves} hint="Working days a month. 0 = no limit.">
              <Input id="monthly_full_leaves" inputMode="numeric" value={form.monthly_full_leaves} onChange={(e) => set('monthly_full_leaves', e.target.value)} />
            </Field>
            <Field label="Half-day / short leaves" htmlFor="monthly_half_leaves" error={errors.monthly_half_leaves} hint="Half days a month. 0 = no limit.">
              <Input id="monthly_half_leaves" inputMode="numeric" value={form.monthly_half_leaves} onChange={(e) => set('monthly_half_leaves', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Tracking">
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
            <Field label="Idle after (minutes)" htmlFor="idle_threshold_minutes" error={errors.idle_threshold_minutes} hint="No keyboard or mouse input for this long = Idle.">
              <Input id="idle_threshold_minutes" inputMode="numeric" value={form.idle_threshold_minutes} onChange={(e) => set('idle_threshold_minutes', e.target.value)} />
            </Field>
          </div>
        </Section>
      </fieldset>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={save.isPending}>
            Save rules
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setForm(toForm(settings)); setErrors({}); setStatus(null) }}>
            Discard changes
          </Button>
          {status &&
            (status.ok ? (
              <p role="status" className="text-sm text-emerald-700">{status.text}</p>
            ) : (
              <FormError message={status.text} />
            ))}
        </div>
      )}
    </form>
  )
}

export function ReadOnlyNote() {
  return (
    <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400" data-read-only>
      Only an admin can change these.
    </p>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
