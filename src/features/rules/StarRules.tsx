import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { useDeleteStarRule, useSaveStarRule, useStarRules } from '@/features/stars/api'
import type { StarRule } from '@/lib/stars'
import { useRole } from '@/hooks/useRole'
import { errorMessage } from '@/stores/session'
import { useOrgSettings } from './api'
import { ReadOnlyNote } from './RulesForm'

/** Rules → Stars: what each rule break costs in stars. Everyone sees it; only an admin changes it. */
/** "1 per 30 min late", "1 per 30 min short of 6 h". */
function autoStars(auto: StarRule['auto'], block: number, targetMinutes: number): string {
  return auto === 'late' ? `1 per ${block} min late` : `1 per ${block} min short of ${targetMinutes / 60} h`
}

export function StarRules() {
  const rules = useStarRules()
  const settings = useOrgSettings()
  const block = settings.data?.star_block_minutes ?? 30
  const target = settings.data?.required_daily_minutes ?? 360
  const readOnly = useRole().role !== 'admin'
  const remove = useDeleteStarRule()
  const [editing, setEditing] = useState<StarRule | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onDelete(r: StarRule) {
    setError(null)
    if (!window.confirm(`Delete the rule "${r.name}"? The stars already given for it are removed too.`)) return
    try {
      await remove.mutateAsync(r.id)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-4">
      {readOnly && <ReadOnlyNote />}
      <div className="flex flex-wrap items-center justify-between gap-4 @3xl:flex-nowrap">
        <p className="min-w-0 text-sm text-slate-500">
          Every star takes its value off that day’s pay (Rules → General); excused stars cost nothing. The two automatic rules come from
          attendance; an admin gives the others by hand from Attendance.
        </p>
        {!readOnly && (
          <Button className="shrink-0" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> New rule
          </Button>
        )}
      </div>
      <FormError message={error} />
      <Card>
        {rules.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : rules.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the star rules.</p>
        ) : !rules.data?.length ? (
          <p className="p-6 text-sm text-slate-500">No rules yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Rule break</Th>
                <Th className="text-right">Stars</Th>
                <Th>Given</Th>
                {!readOnly && <Th className="w-40" />}
              </tr>
            </thead>
            <tbody>
              {rules.data.map((r) => (
                <tr key={r.id} data-star-rule={r.auto || r.name}>
                  <Td className="wrap-anywhere">
                    <span className="font-medium">{r.name}</span>
                    {r.description && <span className="block text-xs text-slate-500">{r.description}</span>}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{r.auto ? <span className="font-normal text-slate-500">{autoStars(r.auto, block, target)}</span> : r.stars}</Td>
                  <Td>{r.auto ? <Badge tone="amber">Automatic</Badge> : <Badge tone="blue">By hand</Badge>}</Td>
                  {!readOnly && (
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      {!r.auto && (
                        <Button variant="ghost" size="sm" onClick={() => void onDelete(r)}>
                          Delete
                        </Button>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <StarRuleDialog rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function StarRuleDialog({ rule, onClose }: { rule: StarRule | null; onClose: () => void }) {
  const save = useSaveStarRule()
  const [name, setName] = useState(rule?.name ?? '')
  const [stars, setStars] = useState(rule ? String(rule.stars) : '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const n = Number(stars)
    if (!name.trim()) return setError('Enter a name.')
    if (stars.trim() === '' || !Number.isInteger(n) || n < 0 || n > 100) return setError('Stars must be a whole number from 0 to 100.')
    try {
      await save.mutateAsync({ id: rule?.id, data: { name: name.trim(), stars: n, description: description.trim() } })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save. The name may already be in use.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={rule ? `Edit ${rule.name}` : 'New rule (given by hand)'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Rule break" htmlFor="sr_name">
          <Input id="sr_name" value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        {!rule?.auto && (
          <Field label="Stars" htmlFor="sr_stars" hint="0 = noted, but no stars.">
            <Input id="sr_stars" inputMode="numeric" value={stars} onChange={(e) => setStars(e.target.value)} />
          </Field>
        )}
        <Field label="Description (optional)" htmlFor="sr_description">
          <Input id="sr_description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {rule?.auto && <p className="text-sm text-slate-500">Automatic: the stars are worked out from attendance each day (Rules → General).</p>}
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
