import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import PocketBase from 'pocketbase'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { pb, type UserRecord } from '@/lib/pb'
import { landingFor, roleOf, ROLE_LABEL } from '@/lib/roles'
import { useSession } from '@/stores/session'

/**
 * Shows the signed-in account's role and switches to another account. A role always
 * belongs to a real account, so switching takes that account's email and password;
 * there is no viewing as another role without them.
 */
export function AccountSwitcher() {
  const user = useSession((s) => s.user)!
  const [open, setOpen] = useState(false)
  const role = roleOf(user.role)

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400" data-role={role}>
        {ROLE_LABEL[role]}
      </span>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="size-4" aria-hidden /> Switch account
      </Button>
      {open && <SwitchAccountDialog currentEmail={user.email ?? ''} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SwitchAccountDialog({ currentEmail, onClose }: { currentEmail: string; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (currentEmail && email.trim().toLowerCase() === currentEmail.toLowerCase()) {
      setError('You are already signed in as this account.')
      return
    }
    setBusy(true)
    try {
      // Checked on a separate client, so a wrong password never touches the current session.
      const probe = new PocketBase(pb.baseURL)
      probe.autoCancellation(false)
      await probe.collection('users').authWithPassword(email.trim(), password)
      const record = probe.authStore.record as unknown as UserRecord
      // Close the old account's realtime connection; the remounted shell reconnects as the new one.
      await pb.realtime.unsubscribe()
      queryClient.clear()
      pb.authStore.save(probe.authStore.token, probe.authStore.record)
      onClose()
      navigate(landingFor(roleOf(record.role)))
    } catch (err) {
      const status = (err as { status?: number }).status
      setError(
        status === 0
          ? 'Cannot reach the server. Check your connection and try again.'
          : 'Email or password is incorrect, or that account is inactive.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title="Switch account">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Sign in with the email and password of the account to switch to. Time tracked on this PC will be recorded for that
          account.
        </p>
        <Field label="Email" htmlFor="switch_email">
          <Input
            id="switch_email"
            type="email"
            autoComplete="off"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="switch_password">
          <Input
            id="switch_password"
            type="password"
            autoComplete="off"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={!email || !password}>
            Switch
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
