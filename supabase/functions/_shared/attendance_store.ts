// Database side of attendance (was server/pb_hooks/lib/attendance_store.js), shared by the
// hourly job, the admin's recompute, leave decisions, payroll and stars. The rules stay in
// logic/attendance.js and logic/stars.js.
import att from './logic/attendance.js'
import starLib from './logic/stars.js'
import { pbDate, sql } from './core.ts'

type Settings = Awaited<ReturnType<typeof import('./core.ts').loadSettings>>

/**
 * Recomputes (upserts) attendance for every person employed on each day, and removes records
 * for anyone outside their joined_on–left_on window. `onlyUser` limits it to one person.
 * Days in a month whose payroll is finalized are left as they are.
 * Returns the number of records written.
 */
export async function recomputeDays(settings: Settings, days: string[], onlyUser = ''): Promise<number> {
  const offset = att.offsetFor(settings.timezone)
  const users = onlyUser
    ? await sql`select id, joined_on, left_on, active from profiles where id = ${onlyUser}`
    : await sql`select id, joined_on, left_on, active from profiles`
  // An approved (finalized) month never changes: its pay was worked out from these records.
  const months = [...new Set(days.map((d) => d.slice(0, 7)))]
  const locked = new Set(
    (await sql`select month from payroll_runs where status = 'finalized' and month = any(${months})`).map((m) => m.month as string)
  )
  const starRules = await sql`select id, stars, auto from star_rules`
  // A kind of automatic star counts only while its rule exists (an admin can delete it to switch it off).
  const kinds = starLib.autoKinds(starRules)
  let written = 0

  for (const day of days) {
    if (locked.has(day.slice(0, 7))) continue
    const bounds = att.dayBounds(day, offset)
    const segRows = await sql`select "user", state, started_at, ended_at from activity_segments
      where started_at >= ${bounds.start} and started_at < ${bounds.end}`
    const leaveRows = await sql`select lr."user", lr.start_date, lr.end_date, lr.half_day, lt.paid
      from leave_requests lr join leave_types lt on lt.id = lr.leave_type
      where lr.status = 'approved' and lr.start_date <= ${day} and lr.end_date >= ${day}`
    const holidays = (await sql`select date from holidays where date = ${day}`).map((h) => h.date as string)
    const starRows = onlyUser
      ? await sql`select "user", rule, date, excused from star_records where date = ${day} and "user" = ${onlyUser}`
      : await sql`select "user", rule, date, excused from star_records where date = ${day}`

    const segments: Record<string, unknown[]> = {}
    for (const s of segRows) {
      ;(segments[s.user] ??= []).push({ state: s.state, started_at: pbDate(s.started_at), ended_at: pbDate(s.ended_at) })
    }
    const leaves: Record<string, unknown[]> = {}
    // half_day matters: a half-day leave leaves the other half to be judged on activity.
    // paid too: unpaid leave doesn't pay the part of the day it covers.
    for (const l of leaveRows) {
      ;(leaves[l.user] ??= []).push({ start_date: l.start_date, end_date: l.end_date, half_day: !!l.half_day, paid: !!l.paid })
    }
    const starRecords: Record<string, unknown[]> = {}
    for (const rec of starRows) (starRecords[rec.user] ??= []).push({ rule: rec.rule, date: rec.date, excused: !!rec.excused })

    await sql.begin(async (tx) => {
      for (const u of users) {
        if (!att.employedOn(day, { active: !!u.active, joined_on: u.joined_on, left_on: u.left_on })) {
          await tx`delete from attendance where "user" = ${u.id} and date = ${day}`
          continue
        }
        const r = att.statusFor(day, settings, segments[u.id] ?? [], leaves[u.id] ?? [], holidays)
        // The day's counted stars: late and short unless excused for the day, plus stars given by hand.
        const lateStars = kinds.late ? r.late_stars : 0
        const shortStars = kinds.short ? r.shortfall_stars : 0
        const given = starLib.recordsByDay(starRules, starRecords[u.id] ?? [])[day]
        const totalStars = (given?.late ? 0 : lateStars) + (given?.short ? 0 : shortStars) + (given?.hand ?? 0)
        await tx`insert into attendance ("user", date, status, active_s, idle_s, first_activity_at, last_activity_at,
            late_minutes, late_stars, shortfall_minutes, shortfall_stars, total_stars, pay_basis)
          values (${u.id}, ${day}, ${r.status}, ${r.active_s}, ${r.idle_s},
                  ${r.first_activity_at || null}, ${r.last_activity_at || null},
                  ${r.late_minutes}, ${lateStars}, ${r.shortfall_minutes}, ${shortStars}, ${totalStars}, ${r.pay_basis})
          on conflict ("user", date) do update set status = excluded.status, active_s = excluded.active_s,
            idle_s = excluded.idle_s, first_activity_at = excluded.first_activity_at, last_activity_at = excluded.last_activity_at,
            late_minutes = excluded.late_minutes, late_stars = excluded.late_stars, shortfall_minutes = excluded.shortfall_minutes,
            shortfall_stars = excluded.shortfall_stars, total_stars = excluded.total_stars, pay_basis = excluded.pay_basis`
        written++
      }
    })
  }
  return written
}
