import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { errorMessage } from '@/stores/session'
import { useEmployees, useSaveTeam, useTeams, type Team } from './api'

export function Teams() {
  const teams = useTeams()
  const employees = useEmployees()
  const [editing, setEditing] = useState<Team | 'new' | null>(null)

  const memberCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of employees.data ?? []) if (e.active && e.team) counts.set(e.team, (counts.get(e.team) ?? 0) + 1)
    return counts
  }, [employees.data])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden /> New team
        </Button>
      </div>
      {teams.isLoading ? (
        <Card className="p-6 text-sm text-ink-500">Loading teams…</Card>
      ) : !teams.data?.length ? (
        <Card>
          <EmptyState icon={Users} title="No teams yet" hint="Create one, then add people to it." />
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
          {teams.data.map((t) => (
            <Card key={t.id} lift className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/org/teams/${t.id}`} className="text-base font-bold text-ink-900 hover:text-indigo-700 hover:underline">
                  {t.name}
                </Link>
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                  Edit
                </Button>
              </div>
              <div className="text-[13px] text-ink-500">
                Manager: {t.expand?.manager?.full_name ?? <span className="text-ink-400">No manager</span>}
              </div>
              <div className="text-[13px] text-ink-500">
                Active members <span className="ml-1 text-lg font-bold text-ink-900 tabular-nums">{memberCount.get(t.id) ?? 0}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <TeamDialog team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Create or edit a team. Managers are picked from active managers and admins. */
export function TeamDialog({ team, onClose }: { team: Team | null; onClose: () => void }) {
  const employees = useEmployees()
  const save = useSaveTeam()
  const [name, setName] = useState(team?.name ?? '')
  const [manager, setManager] = useState(team?.manager ?? '')
  const [error, setError] = useState<string | null>(null)

  const candidates = (employees.data ?? []).filter((e) => e.active && (e.role === 'manager' || e.role === 'admin'))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Enter a team name.')
    try {
      await save.mutateAsync({ id: team?.id, name: name.trim(), manager })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save the team. The name may already be in use.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={team ? `Edit ${team.name}` : 'New team'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Team name" htmlFor="t_name">
          <Input id="t_name" value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Manager" htmlFor="t_manager" hint="Only people with the Manager or Admin role are listed.">
          <Select id="t_manager" value={manager} onChange={(e) => setManager(e.target.value)}>
            <option value="">No manager</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} ({c.role})
              </option>
            ))}
          </Select>
        </Field>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending}>
            Save team
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
