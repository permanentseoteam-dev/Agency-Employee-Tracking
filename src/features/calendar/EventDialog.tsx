import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import type { Team } from '@/features/org/api'
import { eventTimes, eventToInput, validateEvent, type CalendarEvent, type EventErrors, type EventInput } from '@/lib/calendar'
import { errorMessage } from '@/stores/session'
import { useDeleteEvent, useSaveEvent } from './api'

/** Add or edit a company event (admins). `day` pre-fills the date of a new one. */
export function EventDialog({
  event,
  day,
  teams,
  tz,
  onClose
}: {
  event: CalendarEvent | null
  day: string
  teams: Team[]
  tz: string
  onClose: () => void
}) {
  const save = useSaveEvent()
  const remove = useDeleteEvent()
  return (
    <EventForm
      event={event}
      day={day}
      tz={tz}
      teams={teams}
      placeholder="e.g. Monthly town hall"
      saving={save.isPending}
      deleting={remove.isPending}
      onSave={(data) => save.mutateAsync({ id: event?.id, data })}
      onDelete={event ? () => remove.mutateAsync(event.id) : undefined}
      onClose={onClose}
    />
  )
}

export type EventFormData = Pick<CalendarEvent, 'title' | 'description' | 'team' | 'starts_at' | 'ends_at'>

/**
 * The event form for any calendar: title, all day or start and end times, and details.
 * With `teams`, it also asks who the event is for (company events).
 */
export function EventForm({
  event,
  day,
  tz,
  teams,
  placeholder,
  saving,
  deleting,
  onSave,
  onDelete,
  onClose
}: {
  event: CalendarEvent | null
  day: string
  tz: string
  teams?: Team[]
  placeholder: string
  saving: boolean
  deleting: boolean
  onSave: (data: EventFormData) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onClose: () => void
}) {
  const [form, setForm] = useState<EventInput>(() =>
    event
      ? eventToInput(event, tz)
      : { title: '', allDay: false, startDate: day, startTime: '10:00', endDate: day, endTime: '11:00', team: '', description: '' }
  )
  const [errors, setErrors] = useState<EventErrors>({})
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<EventInput>) => setForm((f) => ({ ...f, ...patch }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const found = validateEvent(form, tz)
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      await onSave({ title: form.title.trim(), description: form.description.trim(), team: form.team, ...eventTimes(form, tz) })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the event.'))
    }
  }

  async function onDeleteClick() {
    if (!event || !onDelete || !window.confirm(`Delete "${event.title}"?`)) return
    try {
      await onDelete()
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the event.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={event ? 'Edit event' : 'Add event'} className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Title" htmlFor="ev_title" error={errors.title}>
          <Input id="ev_title" value={form.title} maxLength={200} autoFocus placeholder={placeholder} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-indigo-600" checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
          All day
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="ev_start_date" error={errors.startDate}>
            <Input
              id="ev_start_date"
              type="date"
              value={form.startDate}
              onChange={(e) => set({ startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })}
            />
          </Field>
          {!form.allDay && (
            <Field label="at" htmlFor="ev_start_time" error={errors.startTime}>
              <Input id="ev_start_time" type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} />
            </Field>
          )}
          <Field label="Ends" htmlFor="ev_end_date" error={errors.endDate}>
            <Input id="ev_end_date" type="date" value={form.endDate} min={form.startDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
          {!form.allDay && (
            <Field label="at" htmlFor="ev_end_time" error={errors.endTime}>
              <Input id="ev_end_time" type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} />
            </Field>
          )}
        </div>
        {teams && (
          <Field label="Who it’s for" htmlFor="ev_team">
            <Select id="ev_team" value={form.team} onChange={(e) => set({ team: e.target.value })}>
              <option value="">Everyone (company-wide)</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} team
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Details (optional)" htmlFor="ev_description" error={errors.description}>
          <textarea
            id="ev_description"
            rows={3}
            maxLength={2000}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {event && onDelete && (
            <Button type="button" variant="danger" className="ml-auto" loading={deleting} onClick={() => void onDeleteClick()}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
