import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { pb, type UserRecord } from '@/lib/pb'
import { useRoleStore } from '@/stores/role'
import { useSession } from '@/stores/session'
import { AuthLayout, FormError } from './AuthLayout'

export function Login() {
  const login = useSession((s) => s.login)
  const selectRole = useRoleStore((s) => s.select)
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
      // Start each sign-in on the user's own role.
      selectRole((pb.authStore.record as unknown as UserRecord).role)
    } catch (err) {
      const status = (err as { status?: number }).status
      setError(
        status === 0
          ? 'Cannot reach the server. Check your connection and try again.'
          : 'Email or password is incorrect, or your account is inactive.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use the email and password from your admin.">
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
        <p className="text-center text-xs text-slate-500">Forgot your password? Ask your admin to reset it.</p>
      </form>
    </AuthLayout>
  )
}
