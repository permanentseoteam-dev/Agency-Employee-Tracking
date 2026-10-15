import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { pb } from '@/lib/pb'
import { errorMessage, useSession } from '@/stores/session'
import { AuthLayout, FormError } from './AuthLayout'

const MIN_PASSWORD = 8

/**
 * "Create an account": a new employee registers themselves (register.pb.js) and is
 * signed straight in. The Gate then shows the tracking notice. Role, team and salary
 * are set by an admin afterwards; the admins get a notification.
 */
export function Register({ onSignIn }: { onSignIn: () => void }) {
  const login = useSession((s) => s.login)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(`The password must be at least ${MIN_PASSWORD} characters.`)
    if (password !== confirm) return setError('The two passwords are different.')
    setBusy(true)
    try {
      await pb.send('/api/register', {
        method: 'POST',
        body: { full_name: fullName, email, phone, password }
      })
    } catch (err) {
      const status = (err as { status?: number }).status
      setError(
        status === 0
          ? 'Cannot reach the server. Check your connection and that Tailscale is on (its icon is by the clock), then try again.'
          : status === 429
            ? 'Too many sign-ups from this PC. Wait a minute and try again.'
            : errorMessage(err, 'The account could not be created. Please try again.')
      )
      setBusy(false)
      return
    }
    try {
      await login(email, password)
    } catch {
      // The account exists; only the automatic sign-in failed.
      setError('Your account was created. Sign in with your email and password.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Create an account" subtitle="For new staff. Your admin then sets your team and role.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="full_name">
          <Input
            id="full_name"
            autoComplete="name"
            autoFocus
            required
            maxLength={100}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="Email" htmlFor="reg_email">
          <Input
            id="reg_email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone" htmlFor="reg_phone" hint="Optional">
          <Input
            id="reg_phone"
            type="tel"
            autoComplete="tel"
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="reg_password" hint={`At least ${MIN_PASSWORD} characters.`}>
          <Input
            id="reg_password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password" htmlFor="reg_confirm">
          <Input
            id="reg_confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <Button
          type="submit"
          className="w-full"
          loading={busy}
          disabled={!fullName.trim() || !email.trim() || !password || !confirm}
        >
          Create account
        </Button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <button type="button" onClick={onSignIn} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  )
}
