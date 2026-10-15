import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { must, supabase } from '@/lib/db'
import { errorMessage, useSession } from '@/stores/session'
import { AuthLayout, FormError } from './AuthLayout'

const TRACKED = [
  'Whether you are active or idle, from keyboard and mouse use',
  'Active and idle time, only during shift hours on working days',
  'Your status (Active, Idle, Offline) on your manager’s Live Board'
]

const NOT_TRACKED = [
  'Screenshots or screen recording',
  'What you type, or which apps, websites or files you use',
  'Anything outside shift hours'
]

/** One-time notice shown after the first password change. Tracking starts only once it is accepted. */
export function TrackingNotice() {
  const user = useSession((s) => s.user)!
  const logout = useSession((s) => s.logout)
  const reload = useSession((s) => s.reload)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function accept() {
    setError(null)
    setBusy(true)
    try {
      must(await supabase.from('profiles').update({ tracking_consent_at: new Date().toISOString() }).eq('id', user.id).select())
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Before you start: activity tracking" subtitle="This app records your working time automatically.">
      <div className="space-y-5 text-sm">
        <section>
          <h2 className="mb-2 font-medium">What is recorded</h2>
          <ul className="space-y-1.5">
            {TRACKED.map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-medium">What is never recorded</h2>
          <ul className="space-y-1.5">
            {NOT_TRACKED.map((t) => (
              <li key={t} className="flex gap-2">
                <X className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </section>
        <p className="text-slate-500 dark:text-slate-400">
          You, your team manager and the admins can see your times. The app starts with Windows and keeps
          running in the system tray.
        </p>
        <FormError message={error} />
        <Button className="w-full" loading={busy} onClick={accept}>
          I understand, start tracking
        </Button>
        <Button variant="ghost" className="w-full" onClick={logout}>
          Sign out
        </Button>
      </div>
    </AuthLayout>
  )
}
