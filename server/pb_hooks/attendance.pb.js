/// <reference path="../pb_data/types.d.ts" />
// Attendance (plan §4.2). Marked automatically every night and on demand by an
// admin. Attendance records are written only here (the API rules lock them).
// Each handler runs in its own isolated context: helpers come from require().

// 20:00 UTC = 01:00 in Karachi. Counts the 7 days just finished, so segments that
// synced late (from a PC that was offline) still reach attendance.
cronAdd('attendance', '0 20 * * *', () => {
  const lib = require(`${__hooks}/lib/attendance.js`)
  const store = require(`${__hooks}/lib/attendance_store.js`)
  try {
    const settings = store.loadSettings($app)
    const days = lib.nightlyDays(lib.todayKey(lib.offsetFor(settings.timezone), Date.now()), 7)
    const written = store.recomputeDays($app, settings, days)
    $app.logger().info('attendance: nightly run', 'from', days[days.length - 1], 'to', days[0], 'records', written)
  } catch (err) {
    $app.logger().error('attendance: nightly run failed', 'error', String(err))
  }
})

// Recompute one day ({ date }) or a range ({ from, to }, at most 31 days). Admins only.
routerAdd(
  'POST',
  '/api/attendance/recompute',
  (e) => {
    const lib = require(`${__hooks}/lib/attendance.js`)
    const store = require(`${__hooks}/lib/attendance_store.js`)
    if (e.auth.getString('role') !== 'admin') throw new ForbiddenError('Only admins can recompute attendance.')

    const settings = store.loadSettings(e.app)
    const parsed = lib.parseRange(e.requestInfo().body, lib.todayKey(lib.offsetFor(settings.timezone), Date.now()))
    if (parsed.error) throw new BadRequestError(parsed.error)

    const written = store.recomputeDays(e.app, settings, parsed.data.days)
    return e.json(200, { from: parsed.data.from, to: parsed.data.to, days: parsed.data.days.length, records: written })
  },
  $apis.requireAuth('users')
)
