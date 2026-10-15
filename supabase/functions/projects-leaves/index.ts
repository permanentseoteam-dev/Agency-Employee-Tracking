// Approved leave of a client's people (was GET /api/projects/leaves, projects.pb.js).
// { client, from, to } (at most 62 days) → [{ id, user, start_date, end_date, half_day }]; no leave type or reason.
import lib from '../_shared/logic/projects.js'
import { badRequest, body, caller, json, notFound, serve, sql } from '../_shared/core.ts'

serve(async (req) => {
  const me = await caller(req)
  const parsed = lib.parseLeaveQuery(await body(req))
  if (parsed.error) throw badRequest(parsed.error)
  const [client] = await sql`select archived, members from clients where id = ${parsed.data.client}`
  const members: string[] = client?.members ?? []
  if (!client || !lib.canSee({ archived: client.archived, members }, { id: me.id, role: me.role })) {
    throw notFound('That client doesn’t exist, or you aren’t on it.')
  }
  if (members.length === 0) return json(200, [])
  const rows = await sql`select id, "user", start_date, end_date, half_day from leave_requests
    where status = 'approved' and start_date <= ${parsed.data.to} and end_date >= ${parsed.data.from}
      and "user" = any(${members}) order by start_date`
  return json(200, rows)
})
