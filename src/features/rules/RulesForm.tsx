import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { cn } from '@/lib/cn'
import type { OrgSettings } from '@/lib/pb'
import { shiftHours, validateRules, WEEKDAYS, type RulesErrors, type RulesInput } from '@/lib/rules'
import { errorMessage, useSession } from '@/stores/session'
import { useOrgSettings, useSaveSettings } from './api'

/** Number inputs are kept as text while typing, then parsed on save. */
interface FormState {
  shift_start: string
  shift_end: string
  work_days: number[]
  grace_minutes: string
  full_day_min_hours: string
  half_day_min_hours: string
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
    full_day_min_hours: String(s.full_day_min_hours),
    half_day_min_hours: String(s.half_day_min_hours),
    idle_threshold_minutes: String(s.idle_threshold_minutes),
    monthly_full_leaves: String(s.monthly_full_leaves ?? 0),
    monthly_half_leaves: String(s.monthly_half_leaves ?? 0)
  }
}

function toInput(f: FormState, timezone: string): RulesInput {
  const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(/,/g, '')))
  return {
    shift_start: f.shift_start,
    shift_end: f.shift_end,
    work_days: [...f.work_days].sort(),
    grace_minutes: num(f.grace_minutes),
    full_day_min_hours: num(f.full_day_min_hours),
    half_day_min_hours: num(f.half_day_min_hours),
    idle_threshold_minutes: num(f.idle_threshold_minutes),
    monthly_full_leaves: num(f.monthly_full_leaves),
    monthly_half_leaves: num(f.monthly_half_leaves),
    timezone
  }
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
    const input = toInput(form, settings.timezone)
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
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

        <Section title="Attendance" description="How each working day is marked.">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="Grace period (minutes)" htmlFor="grace_minutes" error={errors.grace_minutes} hint="First activity after shift start + grace = Late.">
              <Input id="grace_minutes" inputMode="numeric" value={form.grace_minutes} onChange={(e) => set('grace_minutes', e.target.value)} />
            </Field>
            <Field label="Full day (hours active)" htmlFor="full_day_min_hours" error={errors.full_day_min_hours}>
              <Input id="full_day_min_hours" inputMode="decimal" value={form.full_day_min_hours} onChange={(e) => set('full_day_min_hours', e.target.value)} />
            </Field>
            <Field label="Half day (hours active)" htmlFor="half_day_min_hours" error={errors.half_day_min_hours} hint="Less than this counts as Half day.">
              <Input id="half_day_min_hours" inputMode="decimal" value={form.half_day_min_hours} onChange={(e) => set('half_day_min_hours', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Leaves per month" description="Most leave one person can take in a calendar month, any leave type. The yearly days per leave type still apply.">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="Full-day leaves" htmlFor="monthly_full_leaves" error={errors.monthly_full_leaves} hint="Working days a month. 0 = no limit.">
              <Input id="monthly_full_leaves" inputMode="numeric" value={form.monthly_full_leaves} onChange={(e) => set('monthly_full_leaves', e.target.value)} />
            </Field>
            <Field label="Half-day / short leaves" htmlFor="monthly_half_leaves" error={errors.monthly_half_leaves} hint="Half days a month. 0 = no limit.">
              <Input id="monthly_half_leaves" inputMode="numeric" value={form.monthly_half_leaves} onChange={(e) => set('monthly_half_leaves', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Tracking">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="Idle after (minutes)" htmlFor="idle_threshold_minutes" error={errors.idle_threshold_minutes} hint="No keyboard or mouse input for this long = Idle.">
              <Input id="idle_threshold_minutes" inputMode="numeric" value={form.idle_threshold_minutes} onChange={(e) => set('idle_threshold_minutes', e.target.value)} />
            </Field>
          </div>
        </Section>
      </fieldset>

      {!readOnly && (
        <div className="flex items-center gap-3">
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
