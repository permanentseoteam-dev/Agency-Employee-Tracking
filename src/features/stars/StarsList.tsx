import { useMemo, useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { monthDays, type AttendanceRecord } from '@/lib/attendance'
import { cn } from '@/lib/cn'
import { formatDayKey } from '@/lib/dates'
import { starLines, starsText, starTotal, type StarLine } from '@/lib/stars'
import { errorMessage } from '@/stores/session'
import { useAddStarRecord, useDeleteStarRecord, useStarRecords, useStarRules } from './api'

/** One person's rule breaks in a month: automatic ones from attendance, plus stars by hand. */
function usePersonStars(userId: string, month: string, attendance: AttendanceRecord[]) {
  const rules = useStarRules()
  const records = useStarRecords(month, userId)
  const lines = useMemo(
    () => starLines(attendance.filter((a) => a.user === userId), rules.data ?? [], records.data ?? []),
    [attendance, userId, rules.data, records.data]
  )
  return { lines, rules, loading: rules.isLoading || records.isLoading, failed: rules.isError || records.isError }
}

/** The rule breaks as a table; admins can remove stars given by hand and excuse automatic ones. */
export function StarsList({ lines, admin }: { lines: StarLine[]; admin?: boolean }) {
  const add = useAddStarRecord()
  const remove = useDeleteStarRecord()
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (lines.length === 0) return <p className="px-5 py-4 text-sm text-slate-500">No rule breaks this month.</p>
  return (
    <>
      <FormError message={error} />
      <Table>
        <thead>
          <tr>
            <Th>Day</Th>
            <Th>Rule break</Th>
            <Th className="text-right">Stars</Th>
            <Th>How</Th>
            {admin && <Th className="w-28" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={`${l.date}|${l.rule.id}`} data-star-line={l.rule.auto || 'hand'} data-excused={l.excused || undefined}>
              <Td className={cn('tabular-nums whitespace-nowrap', l.excused && 'text-slate-400 line-through')}>{formatDayKey(l.date)}</Td>
              <Td className={cn(l.excused && 'text-slate-400 line-through')}>
                {l.rule.name}
                {l.record?.note && <span className="block text-xs text-slate-500 no-underline">{l.record.note}</span>}
              </Td>
              <Td className={cn('text-right tabular-nums font-semibold', l.excused && 'text-slate-400 line-through')}>{l.stars}</Td>
              <Td>
                {l.excused ? (
                  <Badge>Excused</Badge>
                ) : l.automatic ? (
                  <Badge tone="amber">Automatic</Badge>
                ) : (
                  <Badge tone="blue" title={l.record?.expand?.given_by?.full_name ? `Given by ${l.record.expand.given_by.full_name}` : undefined}>
                    By hand
                  </Badge>
                )}
              </Td>
              {admin && (
                <Td className="text-right whitespace-nowrap">
                  {l.automatic && !l.excused && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void run(() => add.mutateAsync({ user: l.user, rule: l.rule.id, date: l.date, note: '', excused: true }))}
                    >
                      Excuse
                    </Button>
                  )}
                  {l.record && (
                    <Button variant="ghost" size="sm" onClick={() => void run(() => remove.mutateAsync(l.record!.id))}>
                      {l.excused ? 'Undo excuse' : 'Remove'}
                    </Button>
                  )}
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  )
}

/** "Stars this month" on My Attendance: the person's own rule breaks. */
export function StarsCard({ userId, month, attendance }: { userId: string; month: string; attendance: AttendanceRecord[] }) {
  const { lines, loading, failed } = usePersonStars(userId, month, attendance)
  return (
    <Card data-stars-card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Star className="size-4 text-amber-500" aria-hidden /> Stars this month
        </CardTitle>
        {!loading && !failed && (
          <span className="text-sm font-semibold tabular-nums" data-star-total>
            {starsText(starTotal(lines))}
          </span>
        )}
      </CardHeader>
      {loading ? (
        <CardContent className="text-sm text-slate-500">Loading…</CardContent>
      ) : failed ? (
        <CardContent className="text-sm text-slate-500">Stars aren’t available right now.</CardContent>
      ) : (
        <StarsList lines={lines} />
      )}
      <CardContent className="border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
        Each rule break gives the stars set in Rules → Stars. More stars is worse. Stars don’t change your pay.
      </CardContent>
    </Card>
  )
}

/** A person's stars from the Attendance grid; admins also give stars by hand here. */
export function StarsDialog({
  person,
  month,
  maxDate,
  attendance,
  admin,
  onClose
}: {
  person: { id: string; full_name: string; joined_on: string; left_on: string }
  month: string
  maxDate: string
  attendance: AttendanceRecord[]
  admin: boolean
  onClose: () => void
}) {
  const { lines, rules, loading, failed } = usePersonStars(person.id, month, attendance)
  const add = useAddStarRecord()
  const byHand = (rules.data ?? []).filter((r) => !r.auto)
  const monthEnd = monthDays(month).at(-1)!
  const lastDay = monthEnd < maxDate ? monthEnd : maxDate
  const [rule, setRule] = useState('')
  const [date, setDate] = useState(lastDay)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onGive(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!rule) return setError('Pick a rule.')
    try {
      await add.mutateAsync({ user: person.id, rule, date, note: note.trim(), excused: false })
      setNote('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Stars: ${person.full_name}`} className="w-[calc(100%-2rem)] max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400" data-star-total>
          {loading ? 'Loading…' : failed ? 'Stars aren’t available right now.' : `${starsText(starTotal(lines))} this month`}
        </p>
        {!loading && !failed && (
          <div className="max-h-[min(20rem,35vh)] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
            <StarsList lines={lines} admin={admin} />
          </div>
        )}
        {admin && !failed && (
          <form onSubmit={onGive} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800" noValidate>
            <p className="text-sm font-medium">Give stars by hand</p>
            {byHand.length === 0 ? (
              <p className="text-sm text-slate-500">Add a rule that is given by hand in Rules → Stars first.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Rule" htmlFor="star_rule">
                    <Select id="star_rule" value={rule} onChange={(e) => setRule(e.target.value)}>
                      <option value="">Pick a rule…</option>
                      {byHand.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({starsText(r.stars)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Day" htmlFor="star_date">
                    <Input id="star_date" type="date" value={date} min={`${month}-01`} max={lastDay} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                </div>
                <Field label="Note (optional)" htmlFor="star_note">
                  <Input id="star_note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <FormError message={error} />
                <Button type="submit" loading={add.isPending}>
                  Give stars
                </Button>
              </>
            )}
          </form>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
