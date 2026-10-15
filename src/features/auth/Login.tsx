import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useSession } from '@/stores/session'
import { AuthLayout, FormError } from './AuthLayout'

export function Login({ onRegister }: { onRegister?: () => void }) {
  const login = useSession((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
    } catch (err) {
      const status = (err as { status?: number }).status
      setError(
        status === 0
          ? 'Cannot reach the server. Check your connection and try again.'
          : status === 403
            ? 'Your account is waiting for your admin’s approval, or it has been switched off. Ask your admin.'
            : status === 429
              ? 'Too many sign-in attempts. Wait a minute and try again.'
              : 'Email or password is incorrect.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Sign in with your email and password.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>
          Sign in
        </Button>
        {onRegister && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            New here?{' '}
            <button type="button" onClick={onRegister} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Create an account
            </button>
          </p>
        )}
        <p className="text-center text-xs text-slate-500">Forgot your password? Ask your admin to reset it.</p>
      </form>
    </AuthLayout>
  )
}
