import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { connectionMessage, type NetworkStatus } from '@/lib/connection'
import { AuthLayout } from './AuthLayout'

const POLL_MS = 5000

async function checkNetwork(): Promise<NetworkStatus> {
  if (window.tracker?.networkStatus) return window.tracker.networkStatus()
  // Outside the desktop app (development in a browser): ask Supabase directly.
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000)
    })
    return { server: res.ok }
  } catch {
    return { server: false }
  }
}

/**
 * Sign-in and Create an account only work while this PC can reach the server.
 * Until then this says to check the internet connection and keeps
 * checking every few seconds; the forms appear by themselves once it answers.
 */
export function ConnectionGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const inFlight = useRef(false)

  const check = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setChecking(true)
    try {
      setStatus(await checkNetwork())
    } finally {
      inFlight.current = false
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  // Keep trying while the server can't be reached; stop once it answers, so a later
  // hiccup never wipes a half-filled form (the forms report that themselves).
  const reachable = status?.server === true
  useEffect(() => {
    if (reachable) return
    const timer = setInterval(() => void check(), POLL_MS)
    return () => clearInterval(timer)
  }, [reachable, check])

  if (reachable) return <>{children}</>

  if (!status) {
    return (
      <AuthLayout title="Checking the connection…">
        <p className="text-sm text-slate-500 dark:text-slate-400">One moment while this PC looks for the server.</p>
      </AuthLayout>
    )
  }

  const message = connectionMessage(status)
  return (
    <AuthLayout title={message.title}>
      <div className="space-y-4" role="status" data-connection={message.kind}>
        <p className="text-sm text-slate-600 dark:text-slate-300">{message.text}</p>
        <Button variant="secondary" className="w-full" loading={checking} onClick={() => void check()}>
          Check again
        </Button>
      </div>
    </AuthLayout>
  )
}
