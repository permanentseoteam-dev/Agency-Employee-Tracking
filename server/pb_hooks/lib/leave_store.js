// Database side of leave requests for leave.pb.js. It needs PocketBase globals
// (through attendance_store.select), so it isn't unit-tested; the rules
// themselves live in leave.js.

/** Holiday day keys from–to, inclusive. */
function holidaysBetween(app, start, end) {
  const store = require(`${__hooks}/lib/attendance_store.js`)
  return store
    .select(app, 'SELECT date FROM holidays WHERE date >= {:start} AND date <= {:end}', { start: start, end: end }, { date: '' })
    .map((h) => h.date)
}

/**
 * The person's first other request overlapping the dates: approved ones, plus
 * pending ones when `includePending`. Returns { start_date, end_date, status } or null.
 */
function overlapping(app, userId, start, end, includePending, exceptId) {
  const store = require(`${__hooks}/lib/attendance_store.js`)
  const statuses = includePending ? "('approved', 'pending')" : "('approved')"
  const rows = store.select(
    app,
    'SELECT start_date, end_date, status FROM leave_requests' +
      ' WHERE user = {:user} AND id != {:except} AND status IN ' + statuses +
      ' AND start_date <= {:end} AND end_date >= {:start} ORDER BY start_date LIMIT 1',
    { user: userId, except: exceptId || '', start: start, end: end },
    { start_date: '', end_date: '', status: '' }
  )
  return rows.length ? rows[0] : null
}

/**
 * Days of one leave type the person already has in a year (approved, plus pending
 * when `includePending`), not counting the request `exceptId`.
 */
function takenDays(app, userId, leaveTypeId, year, includePending, exceptId) {
  const store = require(`${__hooks}/lib/attendance_store.js`)
  const statuses = includePending ? "('approved', 'pending')" : "('approved')"
  const rows = store.select(
    app,
    'SELECT CAST(COALESCE(SUM(days), 0) AS REAL) AS taken FROM leave_requests' +
      ' WHERE user = {:user} AND leave_type = {:type} AND id != {:except} AND status IN ' + statuses +
      ' AND substr(start_date, 1, 4) = {:year}',
    { user: userId, type: leaveTypeId, except: exceptId || '', year: year },
    { taken: -0 }
  )
  return rows.length ? Number(rows[0].taken) || 0 : 0
}

/**
 * Why a request goes over the monthly limits in Rules (settings.monthly_full_leaves /
 * monthly_half_leaves, 0 = no limit), or null. Counts the person's other approved leave,
 * plus pending when `includePending`, in each month the request touches; any leave type.
 */
function monthlyProblem(app, userId, start, end, halfDay, settings, includePending, exceptId) {
  const lib = require(`${__hooks}/lib/leave.js`)
  const store = require(`${__hooks}/lib/attendance_store.js`)
  const limits = { full: settings.monthly_full_leaves, half: settings.monthly_half_leaves }
  if (!(limits.full > 0) && !(limits.half > 0)) return null
  const statuses = includePending ? "('approved', 'pending')" : "('approved')"
  const adding = lib.leaveByMonth(start, end, halfDay, settings.work_days, holidaysBetween(app, start, end))
  for (const month of Object.keys(adding).sort()) {
    const range = { from: month + '-01', to: month + '-31' }
    const others = store
      .select(
        app,
        'SELECT start_date, end_date, CAST(half_day AS INTEGER) AS half_day FROM leave_requests' +
          ' WHERE user = {:user} AND id != {:except} AND status IN ' + statuses +
          ' AND start_date <= {:to} AND end_date >= {:from}',
        { user: userId, except: exceptId || '', from: range.from, to: range.to },
        { start_date: '', end_date: '', half_day: 0 }
      )
      .map((r) => ({ start_date: r.start_date, end_date: r.end_date, half_day: !!r.half_day }))
    const taken = lib.monthTotals(others, month, settings.work_days, holidaysBetween(app, range.from, range.to))
    const problem = lib.monthlyLimitProblem(limits, month, taken, adding[month])
    if (problem) return problem
  }
  return null
}

/** "20 Oct 2026" or "20 Oct – 22 Oct 2026", for messages. */
function rangeText(start, end) {
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const f = (d) => Number(d.slice(8, 10)) + ' ' + MONTH[Number(d.slice(5, 7)) - 1]
  return start === end ? f(start) + ' ' + start.slice(0, 4) : f(start) + ' – ' + f(end) + ' ' + end.slice(0, 4)
}

function overlapMessage(other) {
  return 'These dates overlap your ' + other.status + ' leave on ' + rangeText(other.start_date, other.end_date) + '.'
}

/**
 * After a request is saved: when approved leave appeared or went away on finished
 * days, count that person's attendance for those days again. A failure is logged;
 * the nightly job and the admin recompute still cover it.
 */
function recountAttendance(app, rec, before) {
  try {
    const lib = require(`${__hooks}/lib/leave.js`)
    const att = require(`${__hooks}/lib/attendance.js`)
    const store = require(`${__hooks}/lib/attendance_store.js`)
    const settings = store.loadSettings(app)
    const today = att.todayKey(att.offsetFor(settings.timezone), Date.now())
    const days = lib.attendanceDaysToRecount(before, rec.getString('status'), rec.getString('start_date'), rec.getString('end_date'), today)
    if (days.length) store.recomputeDays(app, settings, days, rec.getString('user'))
  } catch (err) {
    app.logger().error('leave: attendance recount', 'error', String(err))
  }
}

module.exports = { holidaysBetween, overlapping, takenDays, monthlyProblem, overlapMessage, recountAttendance }
