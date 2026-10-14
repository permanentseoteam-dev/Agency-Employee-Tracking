import { useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { useOrgSettings } from '@/features/rules/api'
import { useRole } from '@/hooks/useRole'
import { formatDayKey, toDateKey, DEFAULT_TZ } from '@/lib/dates'
import { fallsOnDayOff, holidaysInYear, validateHoliday, type Holiday, type HolidayErrors } from '@/lib/holidays'
import { errorMessage } from '@/stores/session'
import { useDeleteHoliday, useHolidays, useSaveHoliday } from './api'

export function HolidayManager() {
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const settings = useOrgSettings()
  const tz = settings.data?.timezone || DEFAULT_TZ
  const workDays = settings.data?.work_days ?? [1, 2, 3, 4, 5]
  const today = toDateKey(Date.now(), tz)
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const holidays = useHolidays()
  const remove = useDeleteHoliday()
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => holidaysInYear(holidays.data ?? [], year), [holidays.data, year])
  const onWorkdays = rows.filter((h) => !fallsOnDayOff(h.date, workDays)).length

  async function onDelete(h: Holiday) {
    setError(null)
    if (!window.confirm(`Delete "${h.name}" on ${formatDayKey(h.date)}?`)) return
    try {
      await remove.mutateAsync(h.id)
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the holiday.'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Year">
          <Button variant="ghost" size="sm" aria-label="Previous year" onClick={() => setYear(year - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="w-14 text-center text-lg font-semibold tabular-nums" data-year>
            {year}
          </span>
          <Button variant="ghost" size="sm" aria-label="Next year" onClick={() => setYear(year + 1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="text-sm text-slate-500">
          {rows.length} holiday{rows.length === 1 ? '' : 's'}
          {rows.length > 0 && ` · ${onWorkdays} on working days`}
        </p>
        {isAdmin && (
          <Button className="ml-auto" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Add holiday
          </Button>
        )}
      </div>
      <FormError message={error} />

      <Card>
        {holidays.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : holidays.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load holidays.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No holidays in {year} yet.{isAdmin ? ' Add public and company holidays so attendance and payroll skip them.' : ''}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-48">Date</Th>
                <Th>Holiday</Th>
                <Th />
                {isAdmin && <Th className="w-36" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const past = h.date < today
                return (
                  <tr key={h.id} data-holiday={h.date} className={past ? 'text-slate-400 dark:text-slate-500' : undefined}>
                    <Td className="tabular-nums">{formatDayKey(h.date)}</Td>
                    <Td className={past ? undefined : 'font-medium'}>{h.name}</Td>
                    <Td>
                      {h.date === today ? (
                        <Badge tone="blue">Today</Badge>
                      ) : fallsOnDayOff(h.date, workDays) ? (
                        <Badge title="Not a working day anyway, so it changes nothing">Day off anyway</Badge>
                      ) : null}
                    </Td>
                    {isAdmin && (
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(h)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void onDelete(h)}>
                          Delete
                        </Button>
                      </Td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">Holidays are not counted as absences and are left out of the per-day salary rate.</p>

      {editing && (
        <HolidayDialog
          holiday={editing === 'new' ? null : editing}
          existing={holidays.data ?? []}
          defaultDate={year === Number(today.slice(0, 4)) ? today : `${year}-01-01`}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function HolidayDialog({
  holiday,
  existing,
  defaultDate,
  onClose
}: {
  holiday: Holiday | null
  existing: Holiday[]
  defaultDate: string
  onClose: () => void
}) {
  const save = useSaveHoliday()
  const [from, setFrom] = useState(holiday?.date ?? defaultDate)
  const [to, setTo] = useState('')
  const [name, setName] = useState(holiday?.name ?? '')
  const [errors, setErrors] = useState<HolidayErrors>({})
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const input = { from, to: holiday ? '' : to, name }
    const found = validateHoliday(input, existing, holiday?.id)
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      await save.mutateAsync({ id: holiday?.id, input })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save. That date may already be a holiday.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={holiday ? 'Edit holiday' : 'Add holiday'}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="h_name" error={errors.name}>
          <Input id="h_name" value={name} maxLength={100} autoFocus placeholder="e.g. Eid ul Fitr" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={holiday ? 'Date' : 'First day'} htmlFor="h_from" error={errors.from}>
            <Input id="h_from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          {!holiday && (
            <Field label="Last day (optional)" htmlFor="h_to" error={errors.to} hint="For holidays over several days.">
              <Input id="h_to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          )}
        </div>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
