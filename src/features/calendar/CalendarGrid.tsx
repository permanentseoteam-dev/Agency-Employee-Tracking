import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { eventTimeLabel, type CalendarEvent, type DayInfo, type LeaveEntry } from '@/lib/calendar'
import { cn } from '@/lib/cn'
import { formatDayKey } from '@/lib/dates'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Items shown in a day cell before "+N more". */
const PER_CELL = 3

function leaveLabel(l: LeaveEntry): string {
  const name = l.expand?.user?.full_name ?? 'Someone'
  return `${name}${l.half_day ? ' (½)' : ''}`
}

/** The month as a Monday-first grid: holidays, events and approved leave per day. Shared by the company and project calendars. */
export function CalendarGrid({
  weeks,
  month,
  today,
  days,
  tz,
  loading,
  onOpenDay
}: {
  weeks: string[][]
  month: string
  today: string
  days: Map<string, DayInfo>
  tz: string
  loading?: boolean
  onOpenDay: (day: string) => void
}) {
  return (
    <Card className={cn('overflow-hidden', loading && 'opacity-60')}>
      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label="Month">
        {weeks.flat().map((d) => {
          const info = days.get(d)!
          const inMonth = d.startsWith(month)
          const items: { key: string; text: string; className: string }[] = [
            ...info.events.map((e) => ({
              key: `e-${e.id}`,
              text: `${eventTimeLabel(e, d, tz) === 'All day' ? '' : eventTimeLabel(e, d, tz) + ' '}${e.title}`,
              className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            })),
            ...info.leaves.map((l) => ({
              key: `l-${l.id}`,
              text: leaveLabel(l),
              className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
            }))
          ]
          return (
            <div
              key={d}
              role="gridcell"
              tabIndex={0}
              data-day={d}
              data-holiday={info.holiday ?? undefined}
              data-leaves={info.leaves.length}
              data-events={info.events.length}
              onClick={() => onOpenDay(d)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenDay(d)}
              className={cn(
                'min-h-28 cursor-pointer border-b border-r border-slate-100 p-1.5 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:border-slate-800/60 dark:hover:bg-slate-800/40',
                (info.off || info.holiday) && 'bg-slate-50/80 dark:bg-slate-900/60',
                !inMonth && 'opacity-45'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                    d === today ? 'bg-indigo-500 text-white ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent' : 'text-slate-700 dark:text-slate-300'
                  )}
                >
                  {Number(d.slice(8))}
                </span>
              </div>
              {info.holiday && (
                <div className="mt-1 truncate rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300" title={info.holiday}>
                  {info.holiday}
                </div>
              )}
              <div className="mt-1 space-y-0.5">
                {items.slice(0, PER_CELL).map((it) => (
                  <div key={it.key} className={cn('truncate rounded px-1.5 py-0.5 text-[11px]', it.className)} title={it.text}>
                    {it.text}
                  </div>
                ))}
                {items.length > PER_CELL && <div className="px-1.5 text-[11px] font-medium text-slate-500">+{items.length - PER_CELL} more</div>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** Holiday / Event / On leave colour key, with a note on whose leave is shown. */
export function CalendarLegend({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-violet-200 dark:bg-violet-900" /> Holiday
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-emerald-200 dark:bg-emerald-900" /> Event
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded bg-indigo-200 dark:bg-indigo-900" /> On leave (approved)
      </span>
      {children && <span>{children}</span>}
    </div>
  )
}

/** Everything on one day; with `canEdit`, each event has Edit and there's an "Add event" button. */
export function DayDialog({
  day,
  info,
  tz,
  eventNote,
  leaveNote,
  canEdit,
  onEdit,
  onClose
}: {
  day: string
  info: DayInfo
  tz: string
  /** The line under an event's title, e.g. who it's for or who added it. */
  eventNote: (e: CalendarEvent) => string
  /** What follows a person's name in "Off", e.g. the leave type. */
  leaveNote: (l: LeaveEntry) => string
  canEdit: boolean
  onEdit: (event: CalendarEvent | null) => void
  onClose: () => void
}) {
  const empty = !info.holiday && info.events.length === 0 && info.leaves.length === 0
  return (
    <Dialog open onClose={onClose} title={formatDayKey(day)} className="max-w-lg">
      <div className="space-y-4 text-sm" data-day-detail={day}>
        {info.holiday && (
          <p className="rounded-md bg-violet-50 px-3 py-2 text-violet-800 dark:bg-violet-950 dark:text-violet-300">Holiday: {info.holiday}</p>
        )}
        {info.off && !info.holiday && <p className="text-slate-500">Not a working day.</p>}
        {info.events.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Events</h3>
            <ul className="space-y-2">
              {info.events.map((e) => (
                <li key={e.id} className="flex items-start gap-3" data-event={e.id}>
                  <span className="w-24 shrink-0 tabular-nums text-slate-500">{eventTimeLabel(e, day, tz)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-xs text-slate-500">{eventNote(e)}</span>
                    {e.description && <span className="mt-0.5 block whitespace-pre-line text-xs text-slate-600 dark:text-slate-400">{e.description}</span>}
                  </span>
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => onEdit(e)}>
                      Edit
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {info.leaves.length > 0 && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Off</h3>
            <ul className="space-y-1">
              {info.leaves.map((l) => (
                <li key={l.id} data-off={l.user}>
                  <span className="font-medium">{l.expand?.user?.full_name ?? 'Someone'}</span>
                  <span className="text-slate-500">
                    {' '}
                    · {leaveNote(l)}
                    {l.half_day ? ' · half day' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {empty && !info.off && <p className="text-slate-500">Nothing on this day.</p>}
        <div className="flex gap-2 pt-1">
          {canEdit && (
            <Button size="sm" onClick={() => onEdit(null)}>
              <Plus className="size-4" aria-hidden /> Add event on this day
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
