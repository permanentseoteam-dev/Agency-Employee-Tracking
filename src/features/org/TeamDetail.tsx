import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/layout/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { ROLE_LABEL } from '@/lib/roles'
import { errorMessage } from '@/stores/session'
import { useDeleteTeam, useEmployees, useTeams } from './api'
import { TeamDialog } from './Teams'

export function TeamDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const teams = useTeams()
  const employees = useEmployees()
  const remove = useDeleteTeam()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const team = teams.data?.find((t) => t.id === id)
  if (teams.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (!team) {
    return (
      <p className="text-sm text-red-600">
        Team not found. <Link to="/org/teams" className="underline">Back to teams</Link>
      </p>
    )
  }

  const members = (employees.data ?? []).filter((e) => e.team === id)
  const activeMembers = members.filter((m) => m.active)

  async function onDelete() {
    setError(null)
    if (members.length > 0) {
      setError('Move everyone to another team (or to No team) before deleting this team.')
      return
    }
    if (!window.confirm(`Delete the team "${team!.name}"?`)) return
    try {
      await remove.mutateAsync(id)
      navigate('/org/teams')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/org/teams" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
        <ArrowLeft className="size-4" aria-hidden /> Teams
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold wrap-break-word">{team.name}</h2>
          <p className="text-sm wrap-break-word text-slate-500">
            Manager: {team.expand?.manager?.full_name ?? 'none'} · {activeMembers.length} active members
          </p>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit team
          </Button>
          <Button variant="ghost" onClick={onDelete} loading={remove.isPending}>
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        </div>
      </div>
      <FormError message={error} />
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        {members.length === 0 ? (
          <CardContent className="text-sm text-slate-500">
            Nobody is in this team yet. Set the team on an employee’s page to add them.
          </CardContent>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Designation</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <Link to={`/org/employees/${m.id}`} className="flex items-center gap-3 wrap-break-word hover:underline">
                      <Avatar user={m} size={28} className="shrink-0" />
                      {m.full_name}
                    </Link>
                  </Td>
                  <Td>{ROLE_LABEL[m.role]}</Td>
                  <Td>{m.designation || '—'}</Td>
                  <Td>{m.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <TeamDialog team={team} onClose={() => setEditing(false)} />}
    </div>
  )
}
