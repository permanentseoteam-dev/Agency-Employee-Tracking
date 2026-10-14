/// <reference path="../pb_data/types.d.ts" />
// Activity totals per employee and period (plan §4.1 Reports).
// GET /api/reports/activity?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|week|month&team=&user=
// Admins see everyone; managers only people in the teams they manage; employees are refused.

routerAdd(
  'GET',
  '/api/reports/activity',
  (e) => {
    const reports = require(`${__hooks}/lib/reports.js`)
    const role = e.auth.getString('role')
    if (role !== 'admin' && role !== 'manager') throw new ForbiddenError('Reports are for managers and admins.')

    let timezone = 'Asia/Karachi'
    try {
      timezone = e.app.findFirstRecordByFilter('org_settings', '').getString('timezone') || timezone
    } catch (_) {}

    const parsed = reports.parseQuery(e.requestInfo().query, timezone)
    if (parsed.error) throw new BadRequestError(parsed.error)
    const d = parsed.data

    const sql = reports.buildSql(d.group, d.offset, role === 'admin' ? 'all' : 'managed', !!d.team, !!d.user)
    const rows = arrayOf(
      new DynamicModel({ user: '', full_name: '', team: '', period: '', active_s: 0, idle_s: 0 })
    )
    e.app
      .db()
      .newQuery(sql)
      .bind({ start: d.start, end: d.end, caller: e.auth.id, team: d.team, user: d.user })
      .all(rows)

    return e.json(200, { from: d.from, to: d.to, group: d.group, rows: rows })
  },
  $apis.requireAuth('users')
)
