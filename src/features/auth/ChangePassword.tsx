import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { pb } from '@/lib/pb'
import { errorMessage, useSession } from '@/stores/session'
import { AuthLayout, FormError } from './AuthLayout'

const MIN_LENGTH = 8

/** Forced on first login (and after an admin reset) while must_change_password is true. */
export function ChangePassword() {
  const user = useSession((s) => s.user)!
  const logout = useSession((s) => s.logout)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const problem =
    next && next.length < MIN_LENGTH
      ? `Use at least ${MIN_LENGTH} characters.`
      : next && next === current
        ? 'Choose a password different from the temporary one.'
        : confirm && confirm !== next
          ? 'The passwords do not match.'
          : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (problem) return
    setError(null)
    setBusy(true)
    try {
      const email = user.email ?? ''
      await pb.collection('users').update(user.id, {
        oldPassword: current,
        password: next,
        passwordConfirm: confirm,
        must_change_password: false
      })
      // Changing the password signs out every session, including this one.
      await pb.collection('users').authWithPassword(email, next)
    } catch (err) {
      setError(errorMessage(err, 'Could not change the password. Check the temporary password and try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Choose your password" subtitle={`Welcome, ${user.full_name || user.email}. Replace the temporary password before you continue.`}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Temporary password" htmlFor="current">
          <Input id="current" type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="next" hint={`At least ${MIN_LENGTH} characters.`}>
          <Input id="next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={problem ?? undefined}>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={busy} disabled={!current || !next || !confirm || !!problem}>
          Save password
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={logout}>
          Sign out
        </Button>
      </form>
    </AuthLayout>
  )
}
