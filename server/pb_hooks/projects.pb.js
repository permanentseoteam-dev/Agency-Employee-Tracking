/// <reference path="../pb_data/types.d.ts" />
// Projects (the Project tab). The API rules let admins manage clients and let everyone on a
// client use its calendar; these routes give a client's people each other's attendance
// status, which the attendance rules alone would hide. Status only: no hours or times.
// Each handler runs in its own isolated context: helpers come from require().

// GET /api/projects/status?client=&date=YYYY-MM-DD (date defaults to today, never later)
// → { date, today, members: [{ user, status, month: { present, late, half_day, absent, on_leave } }] }
// status: a stored attendance status for a finished day; for today a live one, which may also
// be "not_in_yet"; '' when the person wasn't employed that day or the day isn't counted yet.
routerAdd(
  'GET',
  '/api/projects/status',
  (e) => {
    const lib = require(`${__hooks}/lib/projects.js`)
    const att = require(`${__hooks}/lib/attendance.js`)
    const store = require(`${__hooks}/lib/attendance_store.js`)
    const settings = store.loadSettings(e.app)
    const offset = att.offsetFor(settings.timezone)
    const now = Date.now()
    const today = att.todayKey(offset, now)

    const parsed = lib.parseStatusQuery(e.requestInfo().query, today)
    if (parsed.error) throw new BadRequestError(parsed.error)
    const date = parsed.data.date

    let client = null
    try {
      client = e.app.findRecordById('clients', parsed.data.client)
    } catch (_) {}
    const members = client ? client.getStringSlice('members') : []
    if (!client || !lib.canSee({ archived: client.getBool('archived'), members: members }, { id: e.auth.id, role: e.auth.getString('role') })) {
      throw new NotFoundError('That client doesn’t exist, or you aren’t on it.')
    }
    if (members.length === 0) return e.json(200, { date: date, today: date === today, members: [] })

    // "user IN ({:u0}, {:u1}, …)" with one bound parameter per member.
    const params = {}
    const placeholders = members.map((id, i) => {
      params['u' + i] = id
      return '{:u' + i + '}'
    })
    const inMembers = '(' + placeholders.join(', ') + ')'
    const by = (rows) => {
      const out = {}
      for (const r of rows) (out[r.user] = out[r.user] || []).push(r)
      return out
    }

    const people = store.select(
      e.app,
      'SELECT id, joined_on, left_on, CAST(active AS INTEGER) AS active FROM users WHERE id IN ' + inMembers,
      params,
      { id: '', joined_on: '', left_on: '', active: 0 }
    )

    // Month totals: the stored statuses of the month's finished days up to the date.
    const monthStart = date.slice(0, 7) + '-01'
    const monthEnd = date === today ? att.addDays(today, -1) : date
    const monthRows = by(
      store.select(
        e.app,
        'SELECT user, status FROM attendance WHERE date >= {:from} AND date <= {:to} AND user IN ' + inMembers,
        Object.assign({ from: monthStart, to: monthEnd }, params),
        { user: '', status: '' }
      )
    )

    const statusOf = {}
    if (date === today) {
      const bounds = att.dayBounds(today, offset)
      const segments = by(
        store.select(
          e.app,
          'SELECT user, state, started_at, ended_at FROM activity_segments WHERE started_at >= {:start} AND started_at < {:end} AND user IN ' + inMembers,
          Object.assign({ start: bounds.start, end: bounds.end }, params),
          { user: '', state: '', started_at: '', ended_at: '' }
        )
      )
      const leaves = by(
        store.select(
          e.app,
          "SELECT user, start_date, end_date FROM leave_requests WHERE status = 'approved' AND start_date <= {:day} AND end_date >= {:day} AND user IN " + inMembers,
          Object.assign({ day: today }, params),
          { user: '', start_date: '', end_date: '' }
        )
      )
      const holidays = store.select(e.app, 'SELECT date FROM holidays WHERE date = {:day}', { day: today }, { date: '' }).map((h) => h.date)
      const times = Object.assign({ now: now }, lib.shiftTimes(today, settings, offset))
      for (const p of people) {
        const base = att.statusFor(today, settings, segments[p.id] || [], leaves[p.id] || [], holidays)
        statusOf[p.id] = lib.liveStatus(base, times)
      }
    } else {
      const stored = store.select(
        e.app,
        'SELECT user, status FROM attendance WHERE date = {:day} AND user IN ' + inMembers,
        Object.assign({ day: date }, params),
        { user: '', status: '' }
      )
      for (const r of stored) statusOf[r.user] = r.status
    }

    const out = people.map((p) => ({
      user: p.id,
      status: att.employedOn(date, p) ? statusOf[p.id] || '' : '',
      month: lib.monthCounts(monthRows[p.id] || [])
    }))
    return e.json(200, { date: date, today: date === today, members: out })
  },
  $apis.requireAuth('users')
)

// GET /api/projects/leaves?client=&from=&to= → approved leave of the client's people that
// overlaps the days: [{ id, user, start_date, end_date, half_day }]. No leave type or reason.
routerAdd(
  'GET',
  '/api/projects/leaves',
  (e) => {
    const lib = require(`${__hooks}/lib/projects.js`)
    const store = require(`${__hooks}/lib/attendance_store.js`)
    const parsed = lib.parseLeaveQuery(e.requestInfo().query)
    if (parsed.error) throw new BadRequestError(parsed.error)

    let client = null
    try {
      client = e.app.findRecordById('clients', parsed.data.client)
    } catch (_) {}
    const members = client ? client.getStringSlice('members') : []
    if (!client || !lib.canSee({ archived: client.getBool('archived'), members: members }, { id: e.auth.id, role: e.auth.getString('role') })) {
      throw new NotFoundError('That client doesn’t exist, or you aren’t on it.')
    }
    if (members.length === 0) return e.json(200, [])

    const params = { from: parsed.data.from, to: parsed.data.to }
    const placeholders = members.map((id, i) => {
      params['u' + i] = id
      return '{:u' + i + '}'
    })
    const rows = store.select(
      e.app,
      "SELECT id, user, start_date, end_date, CAST(half_day AS INTEGER) AS half_day FROM leave_requests WHERE status = 'approved' AND start_date <= {:to} AND end_date >= {:from} AND user IN (" +
        placeholders.join(', ') +
        ') ORDER BY start_date',
      params,
      { id: '', user: '', start_date: '', end_date: '', half_day: 0 }
    )
    return e.json(
      200,
      rows.map((r) => ({ id: r.id, user: r.user, start_date: r.start_date, end_date: r.end_date, half_day: !!r.half_day }))
    )
  },
  $apis.requireAuth('users')
)

// ---- project_events: who added it is stamped by the server; an event must end after it starts ----

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib/projects.js`)
  const problem = lib.eventTimesProblem(e.record.getString('starts_at'), e.record.getString('ends_at'))
  if (problem) throw new BadRequestError(problem)
  e.record.set('created_by', e.auth && !e.hasSuperuserAuth() ? e.auth.id : '')
  e.next()
}, 'project_events')

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib/projects.js`)
  const problem = lib.eventTimesProblem(e.record.getString('starts_at'), e.record.getString('ends_at'))
  if (problem) throw new BadRequestError(problem)
  e.record.set('created_by', e.record.original().getString('created_by'))
  e.next()
}, 'project_events')
