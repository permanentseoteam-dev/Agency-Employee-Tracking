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
  /** Counted stars in the month: late + short + given by hand (0 on older runs). */
  stars?: number
  /** Day-pay runs (from 2026-10-20): the month's rates, the stars by kind, what they cost and the sum of day pay. */
  daily_rate?: number
  hourly_rate?: number
  star_value?: number
  late_stars?: number
  shortfall_stars?: number
  hand_stars?: number
  star_deduction_pkr?: number
  gross_pkr?: number
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

/** Pay worked out per day has paisa: "PKR 98,863.64", but "PKR 100,000" when it is whole. */
export function formatPay(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return formatPkr(rounded, Number.isInteger(rounded) ? 0 : 2)
}

/** "+PKR 5,000" / "−PKR 20,000" / "—" for an adjustment. */
export function formatAdjustment(amount: number): string {
  if (!amount) return '—'
  return amount > 0 ? `+${formatPkr(amount)}` : formatPkr(amount)
}

/** A line counted with the day-pay rules (each working day's pay, stars cost pay). Older runs have no daily rate. */
export function isDayPay(item: PayrollItem): boolean {
  return (item.daily_rate ?? 0) > 0
}

export interface Breakdown {
  rate: number
  absent: number
  unpaidLeave: number
  halfDays: number
  /** What the month's stars cost (day-pay runs; already inside deductions). */
  stars: number
  /** The rest: days before joining or after leaving on day-pay runs; earlier pay rules (a late fine) on old ones. Usually 0. */
  other: number
}

/** Amounts behind a line's deductions (the per-day parts keep their decimals). */
export function breakdown(item: PayrollItem): Breakdown {
  const dayPay = isDayPay(item)
  const rate = dayPay ? (item.daily_rate ?? 0) : item.working_days > 0 ? item.base / item.working_days : 0
  const absent = item.absent_days * rate
  const unpaidLeave = item.unpaid_leave_days * rate
  const halfDays = 0.5 * item.half_days * rate
  const stars = dayPay ? (item.star_deduction_pkr ?? 0) : 0
  const other = Math.max(0, Math.round(item.deductions - absent - unpaidLeave - halfDays - stars))
  return { rate, absent, unpaidLeave, halfDays, stars, other }
}

/** Joined or left part-way through the month (day-pay runs pay only the days employed; older runs needed an adjustment). */
export function midMonth(person: { joined_on?: string; left_on?: string }, month: string): 'joined' | 'left' | null {
  const first = `${month}-01`
  // The month's real last day: leaving on it means a full month was worked.
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  if (person.left_on && person.left_on >= first && person.left_on < last) return 'left'
  if (person.joined_on && person.joined_on > first && person.joined_on <= last) return 'joined'
  return null
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function runTotals(items: PayrollItem[]): { base: number; deductions: number; adjustments: number; net: number } {
  const t = items.reduce(
    (t, i) => ({ base: t.base + i.base, deductions: t.deductions + i.deductions, adjustments: t.adjustments + i.adjustment_pkr, net: t.net + i.net }),
    { base: 0, deductions: 0, adjustments: 0, net: 0 }
  )
  return { base: round2(t.base), deductions: round2(t.deductions), adjustments: round2(t.adjustments), net: round2(t.net) }
}

/** The run as a spreadsheet, one line per employee plus a total. Amounts are plain numbers. */
export function payrollCsv(items: PayrollItem[], nameOf: (userId: string) => string): string {
  const header = [
    'Employee',
    'Monthly salary',
    'Working days',
    'Daily rate',
    'Absent',
    'Unpaid leave',
    'Half days',
    'Late stars',
    'Short stars',
    'Hand stars',
    'Stars',
    'Star deduction',
    'Deductions',
    'Adjustment',
    'Note',
    'Net pay'
  ]
  const lines = items.map((i) => [
    nameOf(i.user),
    String(i.base),
    String(i.working_days),
    String(round2(breakdown(i).rate)),
    String(i.absent_days),
    String(i.unpaid_leave_days),
    String(i.half_days),
    String(i.late_stars ?? 0),
    String(i.shortfall_stars ?? 0),
    String(i.hand_stars ?? 0),
    String(i.stars ?? 0),
    String(i.star_deduction_pkr ?? 0),
    String(i.deductions),
    String(i.adjustment_pkr),
    i.note,
    String(i.net)
  ])
  const t = runTotals(items)
  const starDeduction = round2(items.reduce((s, i) => s + (i.star_deduction_pkr ?? 0), 0))
  lines.push(['Total', String(t.base), '', '', '', '', '', '', '', '', '', String(starDeduction), String(t.deductions), String(t.adjustments), '', String(t.net)])
  return toCsv([header, ...lines])
}
