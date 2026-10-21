import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Avatar } from '@/components/layout/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { FormError } from '@/features/auth/AuthLayout'
import { errorMessage } from '@/stores/session'
import { useApproveSignup, useRejectSignup, type Employee } from './api'

function SignupWho({ person: p }: { person: Employee }) {
  return (
    <>
      <Avatar user={p} size={28} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{p.full_name || '(no name)'}</span>
        <span className="block truncate text-xs text-slate-500">
          {p.email}
          {p.phone ? ` · ${p.phone}` : ''}
        </span>
      </span>
    </>
  )
}

/** Approve / Reject for one sign-up. Reject asks once more, because it deletes the account. */
export function SignupDecision({ employee, onDone }: { employee: Employee; onDone?: () => void }) {
  const approve = useApproveSignup()
  const reject = useRejectSignup()
  const [confirmReject, setConfirmReject] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'approve' | 'reject') {
    setError(null)
    try {
      await (action === 'approve' ? approve : reject).mutateAsync(employee.id)
      onDone?.()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={approve.isPending} onClick={() => void run('approve')}>
          <Check className="size-4" aria-hidden /> Approve
        </Button>
        {confirmReject ? (
          <>
            <Button size="sm" variant="danger" loading={reject.isPending} onClick={() => void run('reject')}>
              Yes, delete this sign-up
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReject(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirmReject(true)}>
            <X className="size-4" aria-hidden /> Reject
          </Button>
        )}
      </div>
      <FormError message={error} />
    </div>
  )
}

/**
 * People who used Create an account and wait for a decision: admins see them in Organization → Employees,
 * managers on their Approvals page (approving puts the person in the manager's team).
 */
export function PendingSignups({ people, manager }: { people: Employee[]; manager?: boolean }) {
  if (people.length === 0) return null
  return (
    <Card className="border-amber-300 dark:border-amber-700">
      <CardHeader>
        <CardTitle>Waiting for approval ({people.length})</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {manager
            ? 'They created an account on the sign-in page. Approve to let them sign in (joined today); they join your team, and the admin sets their salary. Reject deletes the sign-up.'
            : 'They created an account on the sign-in page. Approve to let them sign in (joined today), then set their team, role and salary. Reject deletes the sign-up.'}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-4 py-3" data-pending-signup={p.email}>
              {/* Managers can't open Organization: the name is plain text for them. */}
              {manager ? (
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <SignupWho person={p} />
                </span>
              ) : (
                <Link to={`/org/employees/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <SignupWho person={p} />
                </Link>
              )}
              <SignupDecision employee={p} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
