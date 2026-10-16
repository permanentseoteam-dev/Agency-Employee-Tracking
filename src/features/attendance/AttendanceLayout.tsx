import { Outlet } from 'react-router-dom'
import { TabNav } from '@/components/ui/TabNav'

// Managers and admins only; employees keep My Attendance in the sidebar.
const TABS = [
  { to: '/attendance/team', label: 'Team' },
  { to: '/attendance/mine', label: 'My attendance' }
]

export function AttendanceLayout() {
  return (
    <div className="space-y-[18px]">
      <TabNav label="Attendance" tabs={TABS} />
      <Outlet />
    </div>
  )
}
