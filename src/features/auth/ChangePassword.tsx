import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { AppError, must, supabase } from '@/lib/db'
import { errorMessage, useSession } from '@/stores/session'
import { AuthLayout, FormError } from './AuthLayout'

const MIN_LENGTH = 8

/** Forced on first login (and after an admin reset) while must_change_password is true. */
export function ChangePassword() {
  const user = useSession((s) => s.user)!
  const logout = useSession((s) => s.logout)
  const reload = useSession((s) => s.reload)
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
      // Check the temporary password first (the server doesn't ask for it on a change).
      const check = await supabase.auth.signInWithPassword({ email, password: current })
      if (check.error) throw new AppError(check.error.status ? 400 : 0, 'The temporary password is not correct.')
      const changed = await supabase.auth.updateUser({ password: next })
      if (changed.error) throw new AppError(changed.error.status ? 400 : 0, changed.error.message)
      // The server clears the flag itself when the password changes (and refuses to clear it any
      // other way), so this write changes nothing there; it is kept for a server without that.
      must(await supabase.from('profiles').update({ must_change_password: false }).eq('id', user.id).select())
      await reload()
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
