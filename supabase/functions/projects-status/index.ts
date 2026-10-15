// A client's people and their attendance status (was GET /api/projects/status, projects.pb.js).
// { client, date? } → { date, today, members: [{ user, status, month: { present, late, half_day, absent, on_leave } }] }
// Admins, or people on that (not archived) client; status only, no hours or times.
import att from '../_shared/logic/attendance.js'
import lib from '../_shared/logic/projects.js'
import { badRequest, body, caller, json, loadSettings, notFound, pbDate, serve, sql } from '../_shared/core.ts'

serve(async (req) => {
  const me = await caller(req)
  const settings = await loadSettings()
  const offset = att.offsetFor(settings.timezone)
  const now = Date.now()
  const today = att.todayKey(offset, now)
  const parsed = lib.parseStatusQuery(await body(req), today)
  if (parsed.error) throw badRequest(parsed.error)
  const date: string = parsed.data.date

  const [client] = await sql`select archived, members from clients where id = ${parsed.data.client}`
  const members: string[] = client?.members ?? []
  if (!client || !lib.canSee({ archived: client.archived, members }, { id: me.id, role: me.role })) {
    throw notFound('That client doesn’t exist, or you aren’t on it.')
  }
  if (members.length === 0) return json(200, { date, today: date === today, members: [] })

  const people = await sql`select id, joined_on, left_on, active from profiles where id = any(${members})`
  const monthStart = date.slice(0, 7) + '-01'
  const monthEnd = date === today ? att.addDays(today, -1) : date
  const monthRows = await sql`select "user", status from attendance
    where date >= ${monthStart} and date <= ${monthEnd} and "user" = any(${members})`

  const statusOf: Record<string, string> = {}
  if (date === today) {
    const bounds = att.dayBounds(today, offset)
    const segRows = await sql`select "user", state, started_at, ended_at from activity_segments
      where started_at >= ${bounds.start} and started_at < ${bounds.end} and "user" = any(${members})`
    const leaveRows = await sql`select "user", start_date, end_date from leave_requests
      where status = 'approved' and start_date <= ${today} and end_date >= ${today} and "user" = any(${members})`
    const holidays = (await sql`select date from holidays where date = ${today}`).map((h) => h.date as string)
    const times = { now, ...lib.shiftTimes(today, settings, offset) }
    for (const p of people) {
      const segs = segRows.filter((s) => s.user === p.id).map((s) => ({ state: s.state, started_at: pbDate(s.started_at), ended_at: pbDate(s.ended_at) }))
      const leaves = leaveRows.filter((l) => l.user === p.id)
      statusOf[p.id] = lib.liveStatus(att.statusFor(today, settings, segs, leaves, holidays), times)
    }
  } else {
    for (const r of await sql`select "user", status from attendance where date = ${date} and "user" = any(${members})`) statusOf[r.user] = r.status
  }

  const out = people.map((p) => ({
    user: p.id,
    status: att.employedOn(date, { active: !!p.active, joined_on: p.joined_on, left_on: p.left_on }) ? statusOf[p.id] || '' : '',
    month: lib.monthCounts(monthRows.filter((r) => r.user === p.id))
  }))
  return json(200, { date, today: date === today, members: out })
})
