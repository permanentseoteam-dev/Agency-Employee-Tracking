import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { FormError } from '@/features/auth/AuthLayout'
import { errorMessage, useSession } from '@/stores/session'
import { useDeleteLeaveType, useLeaveTypes, useSaveLeaveType, type LeaveType } from './api'
import { ReadOnlyNote } from './RulesForm'

export function LeaveTypes() {
  const types = useLeaveTypes()
  const readOnly = useSession((s) => s.user?.role) !== 'admin'
  const remove = useDeleteLeaveType()
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onDelete(t: LeaveType) {
    setError(null)
    if (!window.confirm(`Delete the leave type "${t.name}"?`)) return
    try {
      await remove.mutateAsync(t.id)
    } catch (err) {
      setError(errorMessage(err, `"${t.name}" is used by existing leave requests, so it can’t be deleted.`))
    }
  }

  return (
    <div className="space-y-4">
      {readOnly && <ReadOnlyNote />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-slate-500">Quotas are per calendar year. Unpaid leave is deducted in payroll.</p>
        {!readOnly && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> New leave type
          </Button>
        )}
      </div>
      <FormError message={error} />
      <Card>
        {types.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : !types.data?.length ? (
          <p className="p-6 text-sm text-slate-500">No leave types yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Leave type</Th>
                <Th>Days per year</Th>
                <Th>Pay</Th>
                {!readOnly && <Th className="w-40" />}
              </tr>
            </thead>
            <tbody>
              {types.data.map((t) => (
                <tr key={t.id}>
                  <Td className="font-medium wrap-anywhere">{t.name}</Td>
                  <Td>{t.yearly_quota_days}</Td>
                  <Td>{t.paid ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Unpaid</Badge>}</Td>
                  {!readOnly && (
                    <Td className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void onDelete(t)}>
                        Delete
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && <LeaveTypeDialog type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function LeaveTypeDialog({ type, onClose }: { type: LeaveType | null; onClose: () => void }) {
  const save = useSaveLeaveType()
  const [name, setName] = useState(type?.name ?? '')
  const [quota, setQuota] = useState(type ? String(type.yearly_quota_days) : '')
  const [paid, setPaid] = useState(type?.paid ?? true)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const days = Number(quota)
    if (!name.trim()) return setError('Enter a name.')
    if (quota.trim() === '' || !Number.isFinite(days) || days < 0 || days * 2 !== Math.round(days * 2)) {
      return setError('Days per year must be 0 or more, in whole or half days.')
    }
    try {
      await save.mutateAsync({ id: type?.id, data: { name: name.trim(), yearly_quota_days: days, paid } })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'Could not save. The name may already be in use.'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={type ? `Edit ${type.name}` : 'New leave type'}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" htmlFor="lt_name">
          <Input id="lt_name" value={name} maxLength={50} autoFocus onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Days per year" htmlFor="lt_quota">
          <Input id="lt_quota" inputMode="decimal" value={quota} onChange={(e) => setQuota(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-indigo-600" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Paid leave (unchecked = deducted from salary)
        </label>
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
