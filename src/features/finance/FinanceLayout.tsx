import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { TabNav } from '@/components/ui/TabNav'

const TABS = [
  { to: '/finance/payroll', label: 'Payroll' },
  { to: '/finance/daily', label: 'Daily pay' },
  { to: '/finance/salaries', label: 'Salaries' }
]

const MY_PAY = '/finance/my-pay'

export function FinanceLayout() {
  const { role } = useRole()
  const { pathname } = useLocation()

  // Everyone sees Finance; only admins run payroll and set salaries. The rest see their own pay.
  if (role !== 'admin') {
    if (pathname !== MY_PAY) return <Navigate to={MY_PAY} replace />
    return (
      <div className="mx-auto max-w-7xl">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-[18px]">
      <TabNav label="Finance" tabs={TABS} />
      <Outlet />
    </div>
  )
}
