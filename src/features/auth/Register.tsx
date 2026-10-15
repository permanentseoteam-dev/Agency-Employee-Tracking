import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { pb } from '@/lib/pb'
import { errorMessage } from '@/stores/session'
import { AuthLayout, FormError } from './AuthLayout'

const MIN_PASSWORD = 8

/**
 * "Create an account": a new employee registers themselves (register.pb.js). The
 * account waits for an admin's approval; once approved they sign in as usual and
 * see the tracking notice. The admins get a notification.
 */
export function Register({ onSignIn }: { onSignIn: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)

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
          ? 'Cannot reach the server. Check your connection and try again.'
          : status === 429
            ? 'Too many sign-ups from this PC. Wait a minute and try again.'
            : errorMessage(err, 'The account could not be created. Please try again.')
      )
      setBusy(false)
      return
    }
    setBusy(false)
    setCreated(true)
  }

  if (created) {
    return (
      <AuthLayout title="Account created" subtitle="It now waits for your admin's approval.">
        <div className="space-y-4" data-signup-done>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Your admin has been told. Once they approve your account, sign in here with <strong>{email.trim().toLowerCase()}</strong> and
            the password you chose.
          </p>
          <Button className="w-full" onClick={onSignIn}>
            Back to sign in
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create an account" subtitle="For new staff. Your admin approves the account before you can sign in.">
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
