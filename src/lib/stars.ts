// Stars count against a person: each rule break gives that rule's stars (star_rules).
// Automatic rules come straight from attendance (a Late, Absent or Half day day);
// an admin gives the others by hand, or excuses an automatic one for a day
// (star_records). Amounts always use the rule's current stars. Pure, so it is tested.
import type { AttendanceStatus } from './attendance'

export type StarAuto = '' | 'late' | 'absent' | 'half_day'

export interface StarRule {
  id: string
  name: string
  stars: number
  /** The attendance status that gives these stars automatically; '' = given by hand. */
  auto: StarAuto
  description: string
}

export interface StarRecord {
  id: string
  user: string
  rule: string
  date: string
  note: string
  given_by: string
  excused: boolean
  expand?: { given_by?: { full_name: string } }
}

export interface StarLine {
  user: string
  date: string
  rule: StarRule
  stars: number
  automatic: boolean
  /** Excused by an admin: shown, but not counted. */
  excused: boolean
  /** The star_records row behind a by-hand star or an excuse. */
  record?: StarRecord
}

/** Every rule break in the given attendance and records, newest first. */
export function starLines(
  attendance: { user: string; date: string; status: AttendanceStatus }[],
  rules: StarRule[],
  records: StarRecord[]
): StarLine[] {
  const byId = new Map(rules.map((r) => [r.id, r]))
  const byStatus = new Map(rules.filter((r) => r.auto).map((r) => [r.auto as string, r]))
  const excuses = new Map(records.filter((r) => r.excused).map((r) => [`${r.user}|${r.rule}|${r.date}`, r]))
  const lines: StarLine[] = []
  for (const a of attendance) {
    const rule = byStatus.get(a.status)
    if (!rule) continue
    const excuse = excuses.get(`${a.user}|${rule.id}|${a.date}`)
    lines.push({ user: a.user, date: a.date, rule, stars: rule.stars, automatic: true, excused: !!excuse, record: excuse })
  }
  for (const r of records) {
    const rule = byId.get(r.rule)
    if (r.excused || !rule) continue
    lines.push({ user: r.user, date: r.date, rule, stars: rule.stars, automatic: false, excused: false, record: r })
  }
  return lines.sort((a, b) => (a.date === b.date ? a.rule.name.localeCompare(b.rule.name) : a.date < b.date ? 1 : -1))
}

/** Stars that count: everything but excused lines. */
export function starTotal(lines: StarLine[]): number {
  return lines.reduce((sum, l) => sum + (l.excused ? 0 : l.stars), 0)
}

/** Counted stars per person. */
export function starsByUser(lines: StarLine[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of lines) if (!l.excused) out[l.user] = (out[l.user] ?? 0) + l.stars
  return out
}

/** "1 star", "3 stars". */
export function starsText(n: number): string {
  return `${n} star${n === 1 ? '' : 's'}`
}
