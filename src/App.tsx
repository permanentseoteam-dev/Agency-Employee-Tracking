import { useEffect } from 'react'
import { createHashRouter, Navigate, RouterProvider, useRouteError } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { ChangePassword } from '@/features/auth/ChangePassword'
import { SignedOut } from '@/features/auth/SignedOut'
import { TrackingNotice } from '@/features/auth/TrackingNotice'
import { AttendanceLayout } from '@/features/attendance/AttendanceLayout'
import { AttendanceTable } from '@/features/attendance/AttendanceTable'
import { MyAttendance } from '@/features/attendance/MyAttendance'
import { CalendarLayout } from '@/features/calendar/CalendarLayout'
import { HolidayManager } from '@/features/calendar/HolidayManager'
import { MonthCalendar } from '@/features/calendar/MonthCalendar'
import { DailyBreakdown } from '@/features/finance/DailyBreakdown'
import { FinanceLayout } from '@/features/finance/FinanceLayout'
import { MyPay } from '@/features/finance/MyPay'
import { PayrollDetail } from '@/features/finance/PayrollDetail'
import { PayrollRuns } from '@/features/finance/PayrollRuns'
import { SalarySetup } from '@/features/finance/SalarySetup'
import { EmployeeDetail } from '@/features/org/EmployeeDetail'
import { Employees } from '@/features/org/Employees'
import { InviteEmployee } from '@/features/org/InviteEmployee'
import { Approvals } from '@/features/leave/Approvals'
import { DecidedLeaves } from '@/features/leave/DecidedLeaves'
import { TeamBalances } from '@/features/leave/TeamBalances'
import { MyLeaves } from '@/features/leave/MyLeaves'
import { MyLeavesLayout } from '@/features/leave/MyLeavesLayout'
import { OrgLayout } from '@/features/org/OrgLayout'
import { TeamDetail } from '@/features/org/TeamDetail'
import { Teams } from '@/features/org/Teams'
import { Placeholder } from '@/features/Placeholder'
import { LeaveTypes } from '@/features/rules/LeaveTypes'
import { RulesForm } from '@/features/rules/RulesForm'
import { RulesLayout } from '@/features/rules/RulesLayout'
import { StarRules } from '@/features/rules/StarRules'
import { MyProfile } from '@/features/profile/MyProfile'
import { ClientCalendar } from '@/features/projects/ClientCalendar'
import { ClientPage } from '@/features/projects/ClientPage'
import { ClientTeam } from '@/features/projects/ClientTeam'
import { ProjectsLayout } from '@/features/projects/ProjectsLayout'
import { LiveBoard } from '@/features/tracking/LiveBoard'
import { MyStats } from '@/features/tracking/MyStats'
import { Reports } from '@/features/tracking/Reports'
import { Settings } from '@/features/profile/Settings'
import { NAV } from '@/lib/roles'
import { useSession } from '@/stores/session'

/** Sign-in steps in order: sign in (or create an account) → forced password change → tracking notice → app. */
function Gate() {
  const user = useSession((s) => s.user)
  if (!user) return <SignedOut />
  if (user.must_change_password) return <ChangePassword />
  if (!user.tracking_consent_at) return <TrackingNotice />
  // Keyed by account: signing in as someone else remounts the shell, so every live subscription restarts.
  return <AppShell key={user.id} />
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
const BUILT = new Set(['/org', '/rules', '/my-stats', '/live', '/reports', '/calendar', '/attendance', '/my-attendance', '/finance', '/my-leaves', '/projects'])

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
        path: 'rules',
        element: <RulesLayout />,
        children: [
          { index: true, element: <Navigate to="/rules/work" replace /> },
          { path: 'work', element: <RulesForm /> },
          { path: 'leave-types', element: <LeaveTypes /> },
          { path: 'stars', element: <StarRules /> }
        ]
      },
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
      {
        path: 'calendar',
        element: <CalendarLayout />,
        children: [
          { index: true, element: <Navigate to="/calendar/month" replace /> },
          { path: 'month', element: <MonthCalendar /> },
          { path: 'holidays', element: <HolidayManager /> }
        ]
      },
      {
        path: 'projects',
        element: <ProjectsLayout />,
        children: [
          {
            path: ':id',
            element: <ClientPage />,
            children: [
              { index: true, element: <Navigate to="team" replace /> },
              { path: 'team', element: <ClientTeam /> },
              { path: 'calendar', element: <ClientCalendar /> }
            ]
          }
        ]
      },
      {
        path: 'finance',
        element: <FinanceLayout />,
        children: [
          { index: true, element: <Navigate to="/finance/payroll" replace /> },
          { path: 'payroll', element: <PayrollRuns /> },
          { path: 'payroll/:id', element: <PayrollDetail /> },
          { path: 'daily', element: <DailyBreakdown /> },
          { path: 'salaries', element: <SalarySetup /> },
          { path: 'my-pay', element: <MyPay /> }
        ]
      },
      { path: 'my-stats', element: <MyStats /> },
      { path: 'my-attendance', element: <MyAttendance /> },
      {
        // Approvals live here as tabs for managers and admins.
        path: 'my-leaves',
        element: <MyLeavesLayout />,
        children: [
          { index: true, element: <MyLeaves /> },
          { path: 'pending', element: <Approvals /> },
          { path: 'decided', element: <DecidedLeaves /> },
          { path: 'balances', element: <TeamBalances /> }
        ]
      },
      {
        path: 'attendance',
        element: <AttendanceLayout />,
        children: [
          { index: true, element: <Navigate to="/attendance/team" replace /> },
          { path: 'team', element: <AttendanceTable /> },
          { path: 'mine', element: <MyAttendance /> }
        ]
      },
      { path: 'live', element: <LiveBoard /> },
      { path: 'reports', element: <Reports /> },
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
  return (
    <>
      {/* The native title bar is hidden: this strip moves the window; the Windows buttons sit on its right. */}
      <div aria-hidden className="drag fixed inset-x-0 top-0 h-8" />
      <RouterProvider router={router} />
    </>
  )
}
