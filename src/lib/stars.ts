// Stars count against a person, and every star costs pay (src/lib/pay.ts). Two rules are automatic and
// come straight from attendance: Late (1 star per started star block after shift start + grace) and
// Short (1 per started block under the daily target). An admin gives the others by hand, or excuses an
// automatic one for a day (star_records). By-hand amounts always use the rule's current stars. Pure, so it is tested.
import type { AttendanceStatus } from './attendance'
import type { DayStars } from './pay'

export type StarAuto = '' | 'late' | 'short'

export interface StarRule {
  id: string
  name: string
  /** Stars per break for a rule given by hand; automatic rules work theirs out from attendance. */
  stars: number
  /** The automatic part of attendance that gives these stars; '' = given by hand. */
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

type StarDay = { user: string; date: string; status: AttendanceStatus; late_stars?: number; shortfall_stars?: number }

/** Every rule break in the given attendance and records, newest first. */
export function starLines(attendance: StarDay[], rules: StarRule[], records: StarRecord[]): StarLine[] {
  const byId = new Map(rules.map((r) => [r.id, r]))
  const late = rules.find((r) => r.auto === 'late')
  const short = rules.find((r) => r.auto === 'short')
  const excuses = new Map(records.filter((r) => r.excused).map((r) => [`${r.user}|${r.rule}|${r.date}`, r]))
  const lines: StarLine[] = []
  for (const a of attendance) {
    for (const [rule, stars] of [
      [late, a.late_stars ?? 0],
      [short, a.shortfall_stars ?? 0]
    ] as const) {
      if (!rule || !stars) continue
      const excuse = excuses.get(`${a.user}|${rule.id}|${a.date}`)
      lines.push({ user: a.user, date: a.date, rule, stars, automatic: true, excused: !!excuse, record: excuse })
    }
  }
  for (const r of records) {
    const rule = byId.get(r.rule)
    if (r.excused || !rule || rule.auto) continue
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

/**
 * One person's star records by day, for pay.calculateMonth (the same as the server's stars.recordsByDay):
 * the stars given by hand that count, and which automatic parts were excused.
 */
export function recordsByDay(rules: StarRule[], records: Pick<StarRecord, 'rule' | 'date' | 'excused'>[]): Record<string, DayStars> {
  const byId = new Map(rules.map((r) => [r.id, r]))
  const out: Record<string, DayStars> = {}
  for (const rec of records) {
    const rule = byId.get(rec.rule)
    if (!rule) continue
    const d = (out[rec.date] ??= { hand: 0, late: false, short: false })
    if (rec.excused) {
      if (rule.auto === 'late') d.late = true
      else if (rule.auto === 'short') d.short = true
    } else if (!rule.auto) {
      d.hand += Number(rule.stars) || 0
    }
  }
  return out
}

/** "1 star", "3 stars". */
export function starsText(n: number): string {
  return `${n} star${n === 1 ? '' : 's'}`
}
