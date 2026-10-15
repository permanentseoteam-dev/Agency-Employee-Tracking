import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { errorMessage } from '@/stores/session'
import { useDeleteClient, useSaveClient, type Client } from './api'

/** New client, or edit one (admins): name, a short description, archive, delete. */
export function ClientDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const navigate = useNavigate()
  const save = useSaveClient()
  const remove = useDeleteClient()
  const [name, setName] = useState(client?.name ?? '')
  const [description, setDescription] = useState(client?.description ?? '')
  const [archived, setArchived] = useState(client?.archived ?? false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give the client a name.')
    try {
      const saved = await save.mutateAsync({ id: client?.id, data: { name: name.trim(), description: description.trim(), archived } })
      onClose()
      if (!client) navigate(`/projects/${saved.id}/team`)
    } catch (err) {
      setError(errorMessage(err, 'Could not save. Is there already a client with this name?'))
    }
  }

  async function onDelete() {
    if (!client || !window.confirm(`Delete ${client.name}? Its calendar is deleted too. People stay as they are.`)) return
    try {
      await remove.mutateAsync(client.id)
      onClose()
      navigate('/projects')
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the client.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={client ? 'Edit client' : 'New client'} className="max-w-md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Client name" htmlFor="client_name">
          <Input id="client_name" value={name} maxLength={100} autoFocus placeholder="e.g. Acme Dental" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Short description (optional)" htmlFor="client_description">
          <Input id="client_description" value={description} maxLength={300} placeholder="e.g. Local SEO retainer" onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {client && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-indigo-600" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            <span>
              Archived
              <span className="block text-xs text-slate-500">Hidden from its people; only admins still see it and its calendar.</span>
            </span>
          </label>
        )}
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending}>
            {client ? 'Save' : 'Add client'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {client && (
            <Button type="button" variant="danger" className="ml-auto" loading={remove.isPending} onClick={() => void onDelete()}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  )
}
