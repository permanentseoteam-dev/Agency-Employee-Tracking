import { Outlet } from 'react-router-dom'
import { TabNav } from '@/components/ui/TabNav'

const TABS = [
  { to: '/calendar/month', label: 'Month' },
  { to: '/calendar/holidays', label: 'Holidays' }
]

export function CalendarLayout() {
  return (
    <div className="mx-auto max-w-7xl space-y-[18px]">
      <TabNav label="Calendar" tabs={TABS} />
      <Outlet />
    </div>
  )
}
