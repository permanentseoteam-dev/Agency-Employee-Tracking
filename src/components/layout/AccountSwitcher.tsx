import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import PocketBase from 'pocketbase'
import { Avatar } from '@/components/layout/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { pb, type UserRecord } from '@/lib/pb'
import { forget, loadAccounts, markNeedsPassword, othersIn, type RememberedAccount } from '@/lib/rememberedAccounts'
import { landingFor, roleOf, ROLE_LABEL } from '@/lib/roles'
import { useSession } from '@/stores/session'

/**
 * Shows the signed-in account's role and switches to another account. A role always
 * belongs to a real account: one that has signed in on this PC before switches in one
 * click (its saved token); any other account needs its email and password once.
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
      {open && <SwitchAccountDialog currentId={user.id} currentEmail={user.email ?? ''} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SwitchAccountDialog({ currentId, currentEmail, onClose }: { currentId: string; currentEmail: string; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [accounts, setAccounts] = useState(() => othersIn(loadAccounts(), currentId))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The account being switched to, 'form' for the password form, or null. */
  const [busy, setBusy] = useState<string | null>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const refresh = () => setAccounts(othersIn(loadAccounts(), currentId))

  /** Makes the checked client's account the app's session. */
  async function apply(client: PocketBase) {
    const record = client.authStore.record as unknown as UserRecord
    // Close the old account's realtime connection; the remounted shell reconnects as the new one.
    await pb.realtime.unsubscribe()
    queryClient.clear()
    pb.authStore.save(client.authStore.token, client.authStore.record)
    onClose()
    navigate(landingFor(roleOf(record.role)))
  }

  function askPassword(account: RememberedAccount, message: string) {
    setEmail(account.email)
    setPassword('')
    setError(null)
    setNotice(message)
    passwordRef.current?.focus()
  }

  async function switchTo(account: RememberedAccount) {
    setError(null)
    setNotice(null)
    if (account.needsPassword || !account.token) {
      askPassword(account, `Enter the password for ${account.email} to switch to it again.`)
      return
    }
    setBusy(account.id)
    try {
      // The saved token is checked (and renewed) on a separate client first.
      const probe = new PocketBase(pb.baseURL)
      probe.autoCancellation(false)
      probe.authStore.save(account.token, account.record as never)
      await probe.collection('users').authRefresh()
      await apply(probe)
    } catch (err) {
      if ((err as { status?: number }).status === 0) {
        setError('Cannot reach the server. Check your connection and try again.')
      } else {
        markNeedsPassword(account.id)
        refresh()
        askPassword(account, `${account.email} needs its password again (it was signed out, changed or switched off).`)
      }
    } finally {
      setBusy(null)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (currentEmail && email.trim().toLowerCase() === currentEmail.toLowerCase()) {
      setError('You are already signed in as this account.')
      return
    }
    setBusy('form')
    try {
      // Checked on a separate client, so a wrong password never touches the current session.
      const probe = new PocketBase(pb.baseURL)
      probe.autoCancellation(false)
      await probe.collection('users').authWithPassword(email.trim(), password)
      await apply(probe)
    } catch (err) {
      const status = (err as { status?: number }).status
      setError(
        status === 0
          ? 'Cannot reach the server. Check your connection and try again.'
          : 'Email or password is incorrect, or that account is inactive.'
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open onClose={onClose} title="Switch account">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">Time tracked on this PC will be recorded for that account.</p>
        {accounts.length > 0 && (
          <ul
            className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800"
            aria-label="Accounts on this PC"
          >
            {accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2" data-remembered={a.email}>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left hover:opacity-80 disabled:opacity-50"
                  onClick={() => void switchTo(a)}
                  disabled={busy !== null}
                >
                  <Avatar user={a.record} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {a.full_name || a.email}
                      {busy === a.id && <span className="font-normal text-slate-500"> · switching…</span>}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {a.email}
                      {a.needsPassword && ' · needs password'}
                    </span>
                  </span>
                  <Badge className="ml-auto shrink-0">{ROLE_LABEL[roleOf(a.role)]}</Badge>
                </button>
                <button
                  type="button"
                  className="shrink-0 text-xs text-slate-500 hover:text-red-600"
                  aria-label={`Forget ${a.email}`}
                  onClick={() => {
                    forget(a.id)
                    refresh()
                  }}
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {accounts.length > 0 ? 'Or sign in to another account' : 'Sign in with the email and password of the account to switch to.'}
          </p>
          {notice && <p className="text-sm text-amber-700 dark:text-amber-400">{notice}</p>}
          <Field label="Email" htmlFor="switch_email">
            <Input
              id="switch_email"
              type="email"
              autoComplete="off"
              autoFocus={accounts.length === 0}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="switch_password">
            <Input
              ref={passwordRef}
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
            <Button type="submit" loading={busy === 'form'} disabled={!email || !password || (busy !== null && busy !== 'form')}>
              Switch
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  )
}
