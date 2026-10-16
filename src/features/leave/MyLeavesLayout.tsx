import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { TabNav } from '@/components/ui/TabNav'

const MINE = '/my-leaves'

const TABS = [
  { to: MINE, label: 'My leaves', end: true },
  { to: '/my-leaves/pending', label: 'Pending' },
  { to: '/my-leaves/decided', label: 'Decided' },
  { to: '/my-leaves/balances', label: 'Team balances' }
]

export function MyLeavesLayout() {
  const { role } = useRole()
  const { pathname } = useLocation()

  // Employees see only their own leave; managers and admins also approve here.
  if (role === 'employee') {
    if (pathname !== MINE) return <Navigate to={MINE} replace />
    return <Outlet />
  }

  return (
    <div className="mx-auto max-w-6xl space-y-[18px]">
      <TabNav label="My Leaves" tabs={TABS} />
      <Outlet />
    </div>
  )
}
