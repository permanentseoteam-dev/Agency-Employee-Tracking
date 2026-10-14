// Database side of POST /api/payroll/run (payroll.pb.js). It needs PocketBase
// globals (Record, BadRequestError), so it isn't unit-tested; the formula lives in payroll.js.

function groupByUser(rows) {
  const out = {}
  for (const r of rows) (out[r.user] = out[r.user] || []).push(r)
  return out
}

/**
 * Creates or recounts the draft run for a month. The month's attendance is recounted
 * first, so time that synced late, new holidays and late approvals are included.
 * Adjustments and notes already entered on a draft are kept. A finalized run is refused.
 */
function runPayroll(app, month) {
  const lib = require(`${__hooks}/lib/payroll.js`)
  const att = require(`${__hooks}/lib/attendance.js`)
  const store = require(`${__hooks}/lib/attendance_store.js`)
  const settings = store.loadSettings(app)
  const range = lib.monthRange(month)

  let run = null
  try {
    run = app.findFirstRecordByFilter('payroll_runs', 'month = {:month}', { month: month })
  } catch (_) {}
  if (run && run.getString('status') === 'finalized') {
    throw new BadRequestError('Payroll for ' + lib.monthLabel(month) + ' is finalized and can’t be recounted.')
  }

  const yesterday = att.addDays(att.todayKey(att.offsetFor(settings.timezone), Date.now()), -1)
  const countedTo = range.to < yesterday ? range.to : yesterday
  if (range.from <= countedTo) store.recomputeDays(app, settings, att.daysBetween(range.from, countedTo))

  const holidays = store
    .select(app, 'SELECT date FROM holidays WHERE date >= {:from} AND date <= {:to}', range, { date: '' })
    .map((h) => h.date)
  const workingDays = lib.workingDays(month, settings.work_days, holidays)
  const users = store.select(
    app,
    'SELECT id, full_name, joined_on, left_on, CAST(active AS INTEGER) AS active FROM users',
    {},
    { id: '', full_name: '', joined_on: '', left_on: '', active: 0 }
  )
  const salaries = {}
  for (const s of store.select(app, 'SELECT user, monthly_salary_pkr AS amount FROM salaries', {}, { user: '', amount: 0 })) {
    salaries[s.user] = s.amount
  }
  const attendance = groupByUser(
    store.select(app, 'SELECT user, status FROM attendance WHERE date >= {:from} AND date <= {:to}', range, { user: '', status: '' })
  )
  const leaves = groupByUser(
    store
      .select(
        app,
        'SELECT lr.user AS user, lr.start_date AS start_date, lr.end_date AS end_date, CAST(lr.half_day AS INTEGER) AS half_day ' +
          'FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type ' +
          "WHERE lr.status = 'approved' AND lt.paid = FALSE AND lr.start_date <= {:to} AND lr.end_date >= {:from}",
        range,
        { user: '', start_date: '', end_date: '', half_day: 0 }
      )
      .map((l) => ({ user: l.user, start_date: l.start_date, end_date: l.end_date, half_day: !!l.half_day, paid: false }))
  )

  const kept = {}
  if (run) {
    for (const item of app.findRecordsByFilter('payroll_items', 'run = {:run}', '', 0, 0, { run: run.id })) {
      kept[item.getString('user')] = { adjustment: item.getFloat('adjustment_pkr'), note: item.getString('note') }
    }
  }

  const skipped = []
  let items = 0
  app.runInTransaction((tx) => {
    if (!run) {
      run = new Record(tx.findCollectionByNameOrId('payroll_runs'))
      run.set('month', month)
      run.set('status', 'draft')
      tx.save(run)
    }
    for (const old of tx.findRecordsByFilter('payroll_items', 'run = {:run}', '', 0, 0, { run: run.id })) tx.delete(old)

    const collection = tx.findCollectionByNameOrId('payroll_items')
    for (const u of users) {
      if (!lib.employedDuring(month, { active: !!u.active, joined_on: u.joined_on, left_on: u.left_on })) continue
      const base = salaries[u.id] || 0
      if (base <= 0) {
        skipped.push(u.full_name || u.id)
        continue
      }
      const counts = lib.attendanceCounts(attendance[u.id])
      const unpaid = lib.unpaidLeaveDays(leaves[u.id], month, settings.work_days, holidays)
      const keep = kept[u.id] || { adjustment: 0, note: '' }
      const result = lib.calculate({
        base: base,
        workingDays: workingDays,
        absentDays: counts.absent,
        unpaidLeaveDays: unpaid,
        halfDays: counts.half,
        lateCount: counts.late,
        latePenalty: settings.late_penalty_pkr,
        adjustment: keep.adjustment
      })
      const item = new Record(collection)
      item.set('run', run.id)
      item.set('user', u.id)
      item.set('base', base)
      item.set('working_days', workingDays)
      item.set('absent_days', counts.absent)
      item.set('unpaid_leave_days', unpaid)
      item.set('half_days', counts.half)
      item.set('late_count', counts.late)
      item.set('deductions', result.deductions)
      item.set('adjustment_pkr', Math.round(keep.adjustment))
      item.set('note', keep.note)
      item.set('net', result.net)
      tx.save(item)
      items++
    }
  })

  return { run: run.id, month: month, items: items, skipped: skipped, counted_to: range.from <= countedTo ? countedTo : '' }
}

module.exports = { runPayroll }
