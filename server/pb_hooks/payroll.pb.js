/// <reference path="../pb_data/types.d.ts" />
// Payroll (plan §4.5). Admins run a month into a draft, review it, set adjustments,
// then finalize it. A finalized run and its items can't be changed or deleted by
// anyone, superusers included (the dashboard goes through these same requests).
// Each handler runs in its own isolated context: helpers come from require().

// Create or recount the draft for a month: { month: "YYYY-MM" }. Admins only.
routerAdd(
  'POST',
  '/api/payroll/run',
  (e) => {
    const lib = require(`${__hooks}/lib/payroll.js`)
    const att = require(`${__hooks}/lib/attendance.js`)
    const store = require(`${__hooks}/lib/payroll_store.js`)
    if (e.auth.getString('role') !== 'admin') throw new ForbiddenError('Only admins can run payroll.')

    let timezone = 'Asia/Karachi'
    try {
      timezone = e.app.findFirstRecordByFilter('org_settings', '').getString('timezone') || timezone
    } catch (_) {}
    const currentMonth = att.todayKey(att.offsetFor(timezone), Date.now()).slice(0, 7)
    const parsed = lib.parseMonth(e.requestInfo().body, currentMonth)
    if (parsed.error) throw new BadRequestError(parsed.error)

    return e.json(200, store.runPayroll(e.app, parsed.data.month))
  },
  $apis.requireAuth('users')
)

// ---- runs: start as drafts; draft → finalized is the only change; finalized is locked ----

onRecordCreateRequest((e) => {
  if (e.record.getString('status') !== 'draft') throw new BadRequestError('A payroll run starts as a draft.')
  e.next()
}, 'payroll_runs')

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/lib/payroll.js`)
  const before = e.record.original()
  if (before.getString('status') === 'finalized') {
    throw new ForbiddenError('Payroll for ' + lib.monthLabel(before.getString('month')) + ' is finalized and can’t be changed.')
  }
  if (e.record.getString('month') !== before.getString('month')) throw new BadRequestError('A payroll run’s month can’t change.')
  e.next()
}, 'payroll_runs')

onRecordDeleteRequest((e) => {
  const lib = require(`${__hooks}/lib/payroll.js`)
  if (e.record.getString('status') === 'finalized') {
    throw new ForbiddenError('Payroll for ' + lib.monthLabel(e.record.getString('month')) + ' is finalized and can’t be deleted.')
  }
  e.next()
}, 'payroll_runs')

// ---- items: only a draft's adjustment and note can be edited; net follows ----

onRecordCreateRequest((e) => {
  let run = null
  try {
    run = e.app.findRecordById('payroll_runs', e.record.getString('run'))
  } catch (_) {}
  if (run && run.getString('status') === 'finalized') throw new ForbiddenError('This payroll run is finalized and can’t be changed.')
  e.next()
}, 'payroll_items')

onRecordUpdateRequest((e) => {
  const before = e.record.original()
  const run = e.app.findRecordById('payroll_runs', before.getString('run'))
  if (run.getString('status') === 'finalized') throw new ForbiddenError('This payroll run is finalized and can’t be changed.')

  for (const field of ['run', 'user']) {
    if (e.record.getString(field) !== before.getString(field)) throw new BadRequestError('Only the adjustment and note can be changed.')
  }
  for (const field of ['base', 'working_days', 'absent_days', 'unpaid_leave_days', 'half_days', 'late_count', 'deductions']) {
    if (e.record.getFloat(field) !== before.getFloat(field)) {
      throw new BadRequestError('Only the adjustment and note can be changed. Run payroll again to recount the month.')
    }
  }
  const adjustment = e.record.getFloat('adjustment_pkr')
  if (adjustment !== Math.round(adjustment)) throw new BadRequestError('Enter the adjustment in whole rupees.')
  e.record.set('net', e.record.getFloat('base') - e.record.getFloat('deductions') + adjustment)
  e.next()
}, 'payroll_items')

onRecordDeleteRequest((e) => {
  const run = e.app.findRecordById('payroll_runs', e.record.getString('run'))
  if (run.getString('status') === 'finalized') throw new ForbiddenError('This payroll run is finalized and can’t be changed.')
  e.next()
}, 'payroll_items')
