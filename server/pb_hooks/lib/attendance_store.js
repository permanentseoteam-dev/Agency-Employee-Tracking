// Database side of attendance, shared by the nightly cron job and the recompute
// route in attendance.pb.js. It needs PocketBase globals (Record, DynamicModel,
// arrayOf), so it isn't unit-tested; the rules themselves live in attendance.js.

/** The org rules that attendance needs, as plain values. */
function loadSettings(app) {
  const rec = app.findFirstRecordByFilter('org_settings', '')
  let workDays = []
  try {
    workDays = JSON.parse(rec.getString('work_days') || '[]')
  } catch (_) {}
  return {
    shift_start: rec.getString('shift_start'),
    shift_end: rec.getString('shift_end'),
    work_days: workDays,
    grace_minutes: rec.getInt('grace_minutes'),
    half_day_min_hours: rec.getFloat('half_day_min_hours'),
    full_day_min_hours: rec.getFloat('full_day_min_hours'),
    late_penalty_pkr: rec.getInt('late_penalty_pkr'),
    timezone: rec.getString('timezone') || 'Asia/Karachi'
  }
}

/** Runs a read-only query and returns plain objects with the shape's keys. */
function select(app, sql, params, shape) {
  const rows = arrayOf(new DynamicModel(shape))
  app.db().newQuery(sql).bind(params).all(rows)
  const keys = Object.keys(shape)
  const out = []
  for (let i = 0; i < rows.length; i++) {
    const row = {}
    for (const k of keys) row[k] = rows[i][k]
    out.push(row)
  }
  return out
}

function groupByUser(rows) {
  const out = {}
  for (const r of rows) (out[r.user] = out[r.user] || []).push(r)
  return out
}

/**
 * Recomputes (upserts) attendance for every person employed on each day, and removes
 * records for anyone outside their joined_on–left_on window. `onlyUser` limits it to
 * one person (e.g. after their leave is decided). Returns the records written.
 */
function recomputeDays(app, settings, days, onlyUser) {
  const lib = require(`${__hooks}/lib/attendance.js`)
  const offset = lib.offsetFor(settings.timezone)
  const users = select(
    app,
    'SELECT id, joined_on, left_on, CAST(active AS INTEGER) AS active FROM users' + (onlyUser ? ' WHERE id = {:user}' : ''),
    onlyUser ? { user: onlyUser } : {},
    { id: '', joined_on: '', left_on: '', active: 0 }
  )
  const collection = app.findCollectionByNameOrId('attendance')
  let written = 0

  for (const day of days) {
    const bounds = lib.dayBounds(day, offset)
    const segments = groupByUser(
      select(
        app,
        'SELECT user, state, started_at, ended_at FROM activity_segments WHERE started_at >= {:start} AND started_at < {:end}',
        bounds,
        { user: '', state: '', started_at: '', ended_at: '' }
      )
    )
    const leaves = groupByUser(
      select(
        app,
        "SELECT user, start_date, end_date FROM leave_requests WHERE status = 'approved' AND start_date <= {:day} AND end_date >= {:day}",
        { day: day },
        { user: '', start_date: '', end_date: '' }
      )
    )
    const holidays = select(app, 'SELECT date FROM holidays WHERE date = {:day}', { day: day }, { date: '' }).map((h) => h.date)

    const existing = {}
    const existingFilter = onlyUser ? 'date = {:day} && user = {:user}' : 'date = {:day}'
    for (const rec of app.findRecordsByFilter('attendance', existingFilter, '', 0, 0, { day: day, user: onlyUser || '' })) {
      existing[rec.getString('user')] = rec
    }

    app.runInTransaction((tx) => {
      for (const u of users) {
        const current = existing[u.id]
        if (!lib.employedOn(day, { active: !!u.active, joined_on: u.joined_on, left_on: u.left_on })) {
          if (current) tx.delete(current)
          continue
        }
        const result = lib.statusFor(day, settings, segments[u.id] || [], leaves[u.id] || [], holidays)
        const rec = current || new Record(collection)
        rec.set('user', u.id)
        rec.set('date', day)
        rec.set('status', result.status)
        rec.set('active_s', result.active_s)
        rec.set('idle_s', result.idle_s)
        rec.set('first_activity_at', result.first_activity_at)
        rec.set('last_activity_at', result.last_activity_at)
        tx.save(rec)
        written++
      }
    })
  }
  return written
}

module.exports = { loadSettings, recomputeDays, select }
