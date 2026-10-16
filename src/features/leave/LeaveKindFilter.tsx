import { Select } from '@/components/ui/Input'

/** Full days or half days; a short leave is a half day. */
export type LeaveKind = 'all' | 'full' | 'half'

export function byKind<T extends { half_day: boolean }>(rows: T[], kind: LeaveKind): T[] {
  return kind === 'all' ? rows : rows.filter((r) => r.half_day === (kind === 'half'))
}

export function LeaveKindFilter({ value, onChange }: { value: LeaveKind; onChange: (kind: LeaveKind) => void }) {
  return (
    <Select aria-label="Filter by kind of leave" value={value} onChange={(e) => onChange(e.target.value as LeaveKind)} className="w-56 max-w-full">
      <option value="all">All leave</option>
      <option value="full">Full days</option>
      <option value="half">Half days (short leave)</option>
    </Select>
  )
}
