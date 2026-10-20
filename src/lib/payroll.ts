// Pure helpers for the finance screens. The pay itself is calculated on the server
// (shared/logic/payroll.js); these explain and format the stored figures.
import { toCsv } from './csv'

export interface PayrollRun {
  id: string
  month: string
  status: 'draft' | 'finalized'
  created: string
  updated: string
}

export interface PayrollItem {
  id: string
  run: string
  user: string
  base: number
  working_days: number
  absent_days: number
  unpaid_leave_days: number
  half_days: number
  /** Counted stars in the month (they don't cost pay); 0 on older runs. */
  stars?: number
  deductions: number
  adjustment_pkr: number
  note: string
  net: number
}

/** "PKR 100,000" (whole rupees unless decimals are asked for); negatives as "−PKR 5,000". */
export function formatPkr(amount: number, decimals = 0): string {
  const abs = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${amount < 0 ? '−' : ''}PKR ${abs}`
}

/** "+PKR 5,000" / "−PKR 20,000" / "—" for an adjustment. */
export function formatAdjustment(amount: number): string {
  if (!amount) return '—'
  return amount > 0 ? `+${formatPkr(amount)}` : formatPkr(amount)
}

export interface Breakdown {
  rate: number
  absent: number
  unpaidLeave: number
  halfDays: number
  /** Deducted under earlier pay rules (a late fine, or star prices before 2026-10-20); usually 0. */
  other: number
}

/** Amounts behind a line's deductions (the per-day parts keep their decimals). */
export function breakdown(item: PayrollItem): Breakdown {
  const rate = item.working_days > 0 ? item.base / item.working_days : 0
  const absent = item.absent_days * rate
  const unpaidLeave = item.unpaid_leave_days * rate
  const halfDays = 0.5 * item.half_days * rate
  const other = Math.max(0, Math.round(item.deductions - absent - unpaidLeave - halfDays))
  return { rate, absent, unpaidLeave, halfDays, other }
}

/** Joined or left part-way through the month: there is no pro-rating, so the admin sets an adjustment. */
export function midMonth(person: { joined_on?: string; left_on?: string }, month: string): 'joined' | 'left' | null {
  const first = `${month}-01`
  // The month's real last day: leaving on it means a full month was worked.
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  if (person.left_on && person.left_on >= first && person.left_on < last) return 'left'
  if (person.joined_on && person.joined_on > first && person.joined_on <= last) return 'joined'
  return null
}

export function runTotals(items: PayrollItem[]): { base: number; deductions: number; adjustments: number; net: number } {
  return items.reduce(
    (t, i) => ({ base: t.base + i.base, deductions: t.deductions + i.deductions, adjustments: t.adjustments + i.adjustment_pkr, net: t.net + i.net }),
    { base: 0, deductions: 0, adjustments: 0, net: 0 }
  )
}

/** The run as a spreadsheet, one line per employee plus a total. Amounts are plain numbers. */
export function payrollCsv(items: PayrollItem[], nameOf: (userId: string) => string): string {
  const header = ['Employee', 'Monthly salary', 'Working days', 'Absent', 'Unpaid leave', 'Half days', 'Stars', 'Deductions', 'Adjustment', 'Note', 'Net pay']
  const lines = items.map((i) => [
    nameOf(i.user),
    String(i.base),
    String(i.working_days),
    String(i.absent_days),
    String(i.unpaid_leave_days),
    String(i.half_days),
    String(i.stars ?? 0),
    String(i.deductions),
    String(i.adjustment_pkr),
    i.note,
    String(i.net)
  ])
  const t = runTotals(items)
  lines.push(['Total', String(t.base), '', '', '', '', '', String(t.deductions), String(t.adjustments), '', String(t.net)])
  return toCsv([header, ...lines])
}
