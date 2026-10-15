// Activity totals per employee and period (was reports.pb.js).
// { from, to, group: day|week|month, team?, user? } → { from, to, group, rows: [{ user, full_name, team, period, active_s, idle_s }] }
// Admins see everyone; managers only people in the teams they manage; employees are refused.
import reports from '../_shared/logic/reports.js'
import { badRequest, body, caller, forbidden, json, loadSettings, serve, sql } from '../_shared/core.ts'

serve(async (req) => {
  const me = await caller(req)
  if (me.role !== 'admin' && me.role !== 'manager') throw forbidden('Reports are for managers and admins.')
  const settings = await loadSettings()
  const parsed = reports.parseQuery(await body(req), settings.timezone)
  if (parsed.error) throw badRequest(parsed.error)
  const d = parsed.data

  // The local period a segment starts in (Pakistan has no daylight saving: a fixed offset).
  const local = sql`(s.started_at at time zone 'UTC' + make_interval(mins => ${d.offset}))`
  const period =
    d.group === 'month' ? sql`to_char(${local}, 'YYYY-MM')`
    : d.group === 'week' ? sql`to_char(date_trunc('week', ${local}), 'YYYY-MM-DD')`
    : sql`to_char(${local}, 'YYYY-MM-DD')`

  const rows = await sql`
    select s."user" as "user", p.full_name, coalesce(t.name, '') as team, ${period} as period,
      round(sum(case when s.state = 'active' then extract(epoch from s.ended_at - s.started_at) else 0 end))::int as active_s,
      round(sum(case when s.state = 'idle' then extract(epoch from s.ended_at - s.started_at) else 0 end))::int as idle_s
    from activity_segments s
    join profiles p on p.id = s."user"
    left join teams t on t.id = p.team
    where s.started_at >= ${d.start} and s.started_at < ${d.end}
      ${me.role === 'admin' ? sql`` : sql`and t.manager = ${me.id}`}
      ${d.team ? sql`and p.team = ${d.team}` : sql``}
      ${d.user ? sql`and s."user" = ${d.user}` : sql``}
    group by s."user", p.full_name, t.name, period
    order by p.full_name, s."user", period`
  return json(200, { from: d.from, to: d.to, group: d.group, rows })
})
