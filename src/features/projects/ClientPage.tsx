import { useState } from 'react'
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { Pencil, UserPlus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import { AddPeopleDialog } from './AddPeopleDialog'
import { useClients, type Client } from './api'
import { ClientDialog } from './ClientDialog'

const SECTIONS = [
  { to: 'team', label: 'Team' },
  { to: 'calendar', label: 'Calendar' }
]

/** The client open in Project: its name, the admin's buttons, and the Team / Calendar sections. */
export function ClientPage() {
  const { id = '' } = useParams()
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const clients = useClients()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)

  const client = clients.data?.find((c) => c.id === id)
  if (!client) {
    return (
      <p className="text-sm text-slate-500">
        This client isn’t available to you.{' '}
        <Link to="/projects" className="font-medium text-indigo-600 underline">
          Back to Project
        </Link>
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 text-lg font-semibold wrap-break-word">{client.name}</h2>
        {client.description && <span className="min-w-0 text-sm text-slate-500 wrap-break-word">{client.description}</span>}
        {client.archived && <Badge>Archived</Badge>}
        {isAdmin && (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" aria-hidden /> Add people
            </Button>
          </div>
        )}
      </div>

      <nav className="glass inline-flex max-w-full flex-wrap rounded-full p-1" aria-label={`${client.name} sections`}>
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors',
                isActive
                  ? 'bg-[var(--nav-active-bg)] text-indigo-700 shadow-[0_4px_12px_-6px_rgba(27,42,107,.35)] dark:text-indigo-200'
                  : 'text-ink-500 hover:text-ink-900'
              )
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={client} />

      {editing && <ClientDialog client={client} onClose={() => setEditing(false)} />}
      {adding && <AddPeopleDialog client={client} onClose={() => setAdding(false)} />}
    </div>
  )
}

/** The client a Team or Calendar section belongs to. */
export function useClient(): Client {
  return useOutletContext<Client>()
}
