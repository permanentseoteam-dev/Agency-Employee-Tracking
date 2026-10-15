import { useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useRole } from '@/hooks/useRole'
import { cn } from '@/lib/cn'
import { useClients, useProjectsLive } from './api'
import { ClientDialog } from './ClientDialog'

/** Project: one tab per client. Admins see every client and can add one; everyone else sees the clients they're on. */
export function ProjectsLayout() {
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const clients = useClients()
  useProjectsLive()
  const { pathname } = useLocation()
  const [creating, setCreating] = useState(false)

  const [, , currentId = '', section = 'team'] = pathname.split('/')
  const list = clients.data ?? []

  if (clients.isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (clients.isError) return <p className="text-sm text-red-600">Could not load the clients.</p>
  if (!currentId && list[0]) return <Navigate to={`/projects/${list[0].id}/team`} replace />

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-end gap-2 border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Clients">
          {list.map((c) => (
            <NavLink
              key={c.id}
              to={`/projects/${c.id}/${section === 'calendar' ? 'calendar' : 'team'}`}
              data-client={c.id}
              className={() =>
                cn(
                  'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
                  c.id === currentId
                    ? 'border-indigo-600 text-indigo-700 dark:text-indigo-300'
                    : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
                  c.archived && 'italic'
                )
              }
            >
              {c.name}
              <span className="ml-1.5 text-xs font-normal text-slate-400">{c.members.length}</span>
              {c.archived && <span className="ml-1 text-xs font-normal text-slate-400">(archived)</span>}
            </NavLink>
          ))}
        </nav>
        {isAdmin && (
          <Button size="sm" variant="secondary" className="mb-1.5 shrink-0" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> New client
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-sm text-slate-500">
            {isAdmin
              ? 'No clients yet. Add the first one with “New client”, then add the people who work on it.'
              : 'You aren’t on any client yet. The admin adds people to clients.'}
          </p>
        </Card>
      ) : (
        <Outlet />
      )}

      {creating && <ClientDialog client={null} onClose={() => setCreating(false)} />}
    </div>
  )
}
