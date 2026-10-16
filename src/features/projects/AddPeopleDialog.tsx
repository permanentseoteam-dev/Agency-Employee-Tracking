import { useMemo, useState } from 'react'
import { Avatar } from '@/components/layout/Avatar'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { useEmployees } from '@/features/org/api'
import { errorMessage } from '@/stores/session'
import { useChangeMembers, type Client } from './api'

/** Pick staff to add to a client (admins). Anyone active, from any team; they can be on other clients too. */
export function AddPeopleDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const employees = useEmployees()
  const change = useChangeMembers()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (employees.data ?? []).filter(
      (p) =>
        p.active &&
        !p.pending_approval &&
        !client.members.includes(p.id) &&
        (!q || `${p.full_name} ${p.designation} ${p.expand?.team?.name ?? ''}`.toLowerCase().includes(q))
    )
  }, [employees.data, client.members, search])

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onAdd() {
    setError(null)
    try {
      await change.mutateAsync({ id: client.id, add: [...picked] })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not add them.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Add people to ${client.name}`} className="max-w-md">
      <div className="space-y-3">
        <Input aria-label="Search people" placeholder="Search name, job or team" value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          {employees.isLoading ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Everyone matching is already on {client.name}.</p>
          ) : (
            candidates.map((p) => (
              <label
                key={p.id}
                data-candidate={p.id}
                className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <input type="checkbox" className="size-4 shrink-0 accent-indigo-600" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                <Avatar user={p} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.full_name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {[p.designation, p.expand?.team?.name].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onAdd()} loading={change.isPending} disabled={picked.size === 0}>
            {picked.size ? `Add ${picked.size} ${picked.size === 1 ? 'person' : 'people'}` : 'Add'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
