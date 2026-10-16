import { Outlet } from 'react-router-dom'
import { TabNav } from '@/components/ui/TabNav'

const TABS = [
  { to: '/org/employees', label: 'Employees' },
  { to: '/org/teams', label: 'Teams' }
]

export function OrgLayout() {
  return (
    <div className="mx-auto max-w-6xl space-y-[18px]">
      <TabNav label="Organization" tabs={TABS} />
      <Outlet />
    </div>
  )
}
