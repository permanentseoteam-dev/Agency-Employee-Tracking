import { Outlet } from 'react-router-dom'
import { TabNav } from '@/components/ui/TabNav'

const TABS = [
  { to: '/rules/work', label: 'Work rules' },
  { to: '/rules/leave-types', label: 'Leave types' },
  { to: '/rules/stars', label: 'Stars' }
]

export function RulesLayout() {
  return (
    <div className="mx-auto max-w-4xl space-y-[18px]">
      <TabNav label="Rules" tabs={TABS} />
      <Outlet />
    </div>
  )
}
