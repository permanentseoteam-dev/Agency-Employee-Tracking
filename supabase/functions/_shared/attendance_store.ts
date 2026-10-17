// Database side of attendance (was server/pb_hooks/lib/attendance_store.js), shared by the
// hourly job, the admin's recompute and leave decisions. The rules stay in logic/attendance.js.
import att from './logic/attendance.js'
import { pbDate, sql } from './core.ts'

type Settings = Awaited<ReturnType<typeof import('./core.ts').loadSettings>>

/**
 * Recomputes (upserts) attendance for every person employed on each day, and removes records
 * for anyone outside their joined_on–left_on window. `onlyUser` limits it to one person.
 * Returns the number of records written.
 */
export async function recomputeDays(settings: Settings, days: string[], onlyUser = ''): Promise<number> {
  const offset = att.offsetFor(settings.timezone)
  const users = onlyUser
    ? await sql`select id, joined_on, left_on, active from profiles where id = ${onlyUser}`
    : await sql`select id, joined_on, left_on, active from profiles`
  let written = 0

  for (const day of days) {
    const bounds = att.dayBounds(day, offset)
    const segRows = await sql`select "user", state, started_at, ended_at from activity_segments
      where started_at >= ${bounds.start} and started_at < ${bounds.end}`
    const leaveRows = await sql`select "user", start_date, end_date, half_day from leave_requests
      where status = 'approved' and start_date <= ${day} and end_date >= ${day}`
    const holidays = (await sql`select date from holidays where date = ${day}`).map((h) => h.date as string)

    const segments: Record<string, unknown[]> = {}
    for (const s of segRows) {
      ;(segments[s.user] ??= []).push({ state: s.state, started_at: pbDate(s.started_at), ended_at: pbDate(s.ended_at) })
    }
    const leaves: Record<string, unknown[]> = {}
    // half_day matters: a half-day leave leaves the other half to be judged on activity.
    for (const l of leaveRows) (leaves[l.user] ??= []).push({ start_date: l.start_date, end_date: l.end_date, half_day: !!l.half_day })

    await sql.begin(async (tx) => {
      for (const u of users) {
        if (!att.employedOn(day, { active: !!u.active, joined_on: u.joined_on, left_on: u.left_on })) {
          await tx`delete from attendance where "user" = ${u.id} and date = ${day}`
          continue
        }
        const r = att.statusFor(day, settings, segments[u.id] ?? [], leaves[u.id] ?? [], holidays)
        await tx`insert into attendance ("user", date, status, active_s, idle_s, first_activity_at, last_activity_at)
          values (${u.id}, ${day}, ${r.status}, ${r.active_s}, ${r.idle_s},
                  ${r.first_activity_at || null}, ${r.last_activity_at || null})
          on conflict ("user", date) do update set status = excluded.status, active_s = excluded.active_s,
            idle_s = excluded.idle_s, first_activity_at = excluded.first_activity_at, last_activity_at = excluded.last_activity_at`
        written++
      }
    })
  }
  return written
}
