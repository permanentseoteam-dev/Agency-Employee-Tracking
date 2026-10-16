import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { useHolidays } from '@/features/calendar/api'
import { useLeaveTypes, useOrgSettings } from '@/features/rules/api'
import { formatDays, monthUse, validateLeave, type LeaveInput, type LeaveRequest } from '@/lib/leave'
import { monthLabel } from '@/lib/attendance'
import { errorMessage, useSession } from '@/stores/session'
import { useApplyLeave } from './api'

/** Apply for leave. Shows the working days that will be counted before sending; the server checks again. */
export function ApplyLeaveDialog({ today, mine, onClose }: { today: string; mine: LeaveRequest[]; onClose: () => void }) {
  const user = useSession((s) => s.user)!
  const settings = useOrgSettings()
  const types = useLeaveTypes()
  const holidays = useHolidays()
  const apply = useApplyLeave()
  const [form, setForm] = useState<LeaveInput>({ leave_type: '', start_date: today, end_date: today, half_day: false, reason: '' })
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<LeaveInput>) => {
    setTouched(true)
    setForm((f) => ({ ...f, ...patch }))
  }

  const typeList = types.data ?? []
  const leaveType = form.leave_type || typeList[0]?.id || ''
  const input = { ...form, leave_type: leaveType }
  const holidaySet = useMemo(() => new Set((holidays.data ?? []).map((h) => h.date)), [holidays.data])
  const workDays = settings.data?.work_days ?? [1, 2, 3, 4, 5]
  const limits = { full: settings.data?.monthly_full_leaves ?? 0, half: settings.data?.monthly_half_leaves ?? 0 }
  const hasLimits = limits.full > 0 || limits.half > 0
  const { errors, days } = validateLeave(input, {
    workDays,
    holidays: holidaySet,
    types: typeList,
    mine,
    joinedOn: user.joined_on,
    leftOn: user.left_on,
    limits: hasLimits ? limits : undefined
  })
  // What the month of the start date already uses against the limits in Rules.
  const month = /^\d{4}-\d{2}/.test(form.start_date) ? form.start_date.slice(0, 7) : ''
  const used = month ? monthUse(mine, month, workDays, holidaySet) : null
  const limitText = (n: number, max: number, unit: string) => (max > 0 ? `${n} of ${max} ${unit}` : `${n} ${unit} (no limit)`)
  const shown = touched ? errors : {}
  const ready = !settings.isLoading && !types.isLoading && !holidays.isLoading

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (Object.keys(errors).length) return
    try {
      await apply.mutateAsync(input)
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not send the request.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title="Apply for leave" className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Leave type" htmlFor="lv_type" error={shown.leave_type}>
          <Select id="lv_type" value={leaveType} onChange={(e) => set({ leave_type: e.target.value })}>
            {typeList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.paid ? '' : ' (unpaid)'}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="From" htmlFor="lv_start" error={shown.start_date}>
            <Input
              id="lv_start"
              type="date"
              value={form.start_date}
              onChange={(e) =>
                set({
                  start_date: e.target.value,
                  end_date: form.half_day || form.end_date < e.target.value ? e.target.value : form.end_date
                })
              }
            />
          </Field>
          <Field label="To" htmlFor="lv_end" error={shown.end_date}>
            <Input
              id="lv_end"
              type="date"
              value={form.end_date}
              min={form.start_date}
              disabled={form.half_day}
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </Field>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              id="lv_half"
              type="checkbox"
              className="size-4 accent-indigo-600"
              checked={form.half_day}
              onChange={(e) => set({ half_day: e.target.checked, end_date: e.target.checked ? form.start_date : form.end_date })}
            />
            Half day (short leave)
          </label>
          {shown.half_day && <p className="mt-1 text-xs text-red-600">{shown.half_day}</p>}
        </div>
        <Field label="Reason (optional)" htmlFor="lv_reason" error={shown.reason}>
          <textarea
            id="lv_reason"
            rows={3}
            maxLength={1000}
            value={form.reason}
            onChange={(e) => set({ reason: e.target.value })}
            className="w-full rounded-[var(--radius-control)] border border-line bg-[var(--glass-strong)] px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </Field>
        <p
          className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
          data-preview-days={days}
        >
          {days > 0 ? (
            <>
              <span className="font-semibold">{formatDays(days)}</span> will be counted (weekends and holidays are not).
            </>
          ) : (
            'Pick the dates to see how many working days will be counted.'
          )}
        </p>
        {hasLimits && used && (
          <p className="text-xs text-slate-500" data-month-use>
            {monthLabel(month)} so far: {limitText(used.full, limits.full, 'full days')}, {limitText(used.half, limits.half, 'half days')} (approved
            and pending).
          </p>
        )}
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={apply.isPending} disabled={!ready}>
            Send request
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
