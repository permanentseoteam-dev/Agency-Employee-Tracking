import { useEffect } from 'react'
import { createHashRouter, Navigate, RouterProvider, useRouteError } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { ChangePassword } from '@/features/auth/ChangePassword'
import { Login } from '@/features/auth/Login'
import { TrackingNotice } from '@/features/auth/TrackingNotice'
import { EmployeeDetail } from '@/features/org/EmployeeDetail'
import { Employees } from '@/features/org/Employees'
import { InviteEmployee } from '@/features/org/InviteEmployee'
import { OrgLayout } from '@/features/org/OrgLayout'
import { TeamDetail } from '@/features/org/TeamDetail'
import { Teams } from '@/features/org/Teams'
import { Placeholder } from '@/features/Placeholder'
import { MyProfile } from '@/features/profile/MyProfile'
import { Settings } from '@/features/profile/Settings'
import { NAV } from '@/lib/roles'
import { useSession } from '@/stores/session'

/** Sign-in steps in order: login → forced password change → tracking notice → app. */
function Gate() {
  const user = useSession((s) => s.user)
  if (!user) return <Login />
  if (user.must_change_password) return <ChangePassword />
  if (!user.tracking_consent_at) return <TrackingNotice />
  return <AppShell />
}

function CrashScreen() {
  const error = useRouteError()
  useEffect(() => {
    window.tracker?.logError(`render crash: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
  }, [error])
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-slate-500">The problem was saved to the log file.</p>
      <Button
        onClick={() => {
          window.location.hash = '#/'
          window.location.reload()
        }}
      >
        Reload
      </Button>
    </div>
  )
}

/** Sidebar sections that have real screens; the rest show a placeholder until their module. */
const BUILT = new Set(['/org'])

// Hash routing, because the packaged app loads index.html from disk. The router
// stays mounted for the whole app life; the Gate decides what the root shows.
const router = createHashRouter([
  {
    path: '/',
    element: <Gate />,
    errorElement: <CrashScreen />,
    children: [
      ...NAV.filter((item) => !BUILT.has(item.path)).map((item) => ({
        path: item.path.slice(1),
        element: <Placeholder title={item.label} module={item.module} />
      })),
      {
        path: 'org',
        element: <OrgLayout />,
        children: [
          { index: true, element: <Navigate to="/org/employees" replace /> },
          { path: 'employees', element: <Employees /> },
          { path: 'employees/new', element: <InviteEmployee /> },
          { path: 'employees/:id', element: <EmployeeDetail /> },
          { path: 'teams', element: <Teams /> },
          { path: 'teams/:id', element: <TeamDetail /> }
        ]
      },
      { path: 'profile', element: <MyProfile /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: null }
    ]
  }
])

export default function App() {
  const ready = useSession((s) => s.ready)
  const init = useSession((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="size-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }
  return <RouterProvider router={router} />
}
