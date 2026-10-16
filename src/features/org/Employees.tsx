import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/layout/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { Toggle } from '@/components/ui/Toggle'
import { ROLE_LABEL } from '@/lib/roles'
import { useEmployees, useOrgLive, useTeams } from './api'
import { PendingSignups } from './PendingSignups'

export function Employees() {
  const navigate = useNavigate()
  const employees = useEmployees()
  useOrgLive()
  const teams = useTeams()
  const [search, setSearch] = useState('')
  const [team, setTeam] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const pending = useMemo(() => (employees.data ?? []).filter((e) => e.pending_approval), [employees.data])
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (employees.data ?? []).filter(
      (e) =>
        !e.pending_approval &&
        (showInactive || e.active) &&
        (!team || (team === 'none' ? !e.team : e.team === team)) &&
        (!q || `${e.full_name} ${e.email ?? ''} ${e.designation}`.toLowerCase().includes(q))
    )
  }, [employees.data, search, team, showInactive])

  return (
    <div className="space-y-4">
      <PendingSignups people={pending} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input
            aria-label="Search employees"
            placeholder="Search name, email or designation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select aria-label="Filter by team" value={team} onChange={(e) => setTeam(e.target.value)} className="w-48">
          <option value="">All teams</option>
          {teams.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="none">No team</option>
        </Select>
        <label className="flex items-center gap-2.5 text-sm text-ink-700">
          <Toggle checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <Button className="ml-auto" onClick={() => navigate('/org/employees/new')}>
          <UserPlus className="size-4" aria-hidden /> Add employee
        </Button>
      </div>

      <Card>
        {employees.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading employees…</p>
        ) : employees.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load employees.</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No employees match these filters.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Team</Th>
                <Th>Role</Th>
                <Th>Designation</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <Td>
                    <Link to={`/org/employees/${e.id}`} className="flex items-center gap-3">
                      <Avatar user={e} size={28} />
                      <span>
                        <span className="block font-semibold text-ink-900">{e.full_name || '(no name)'}</span>
                        <span className="block text-[12.5px] text-ink-500">{e.email}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td>{e.expand?.team?.name ?? <span className="text-ink-400">-</span>}</Td>
                  <Td>
                    <Badge tone="blue">{ROLE_LABEL[e.role]}</Badge>
                  </Td>
                  <Td>{e.designation || <span className="text-ink-400">-</span>}</Td>
                  <Td>{e.joined_on || <span className="text-ink-400">-</span>}</Td>
                  <Td>{e.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="px-1 text-[12.5px] text-ink-500">
        {rows.length} of {(employees.data?.length ?? 0) - pending.length} people shown
      </p>
    </div>
  )
}
