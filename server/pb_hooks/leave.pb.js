/// <reference path="../pb_data/types.d.ts" />
// Leave approval (plan §4.3). The API rules decide who may touch a request; these
// hooks keep the content honest whatever client sends it: the server counts the
// days, refuses overlaps and paid leave past the quota, locks a sent request, and
// stamps who decided and when. Superusers (dashboard fixes, imports) are trusted.
// Each handler runs in its own isolated context: helpers come from require().

// A new request: count its days and check it before it is saved as pending.
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/lib/leave.js`)
  const ls = require(`${__hooks}/lib/leave_store.js`)
  const store = require(`${__hooks}/lib/attendance_store.js`)
  const rec = e.record
  const start = rec.getString('start_date')
  const end = rec.getString('end_date')
  const halfDay = rec.getBool('half_day')

  if (e.hasSuperuserAuth()) {
    // Trusted import: keep what was sent, but fill in the days when missing.
    if (!(rec.getFloat('days') > 0) && !lib.checkDates(start, end, halfDay)) {
      const days = lib.countDays(start, end, halfDay, store.loadSettings(e.app).work_days, ls.holidaysBetween(e.app, start, end))
      if (days > 0) rec.set('days', days)
    }
    return e.next()
  }
  // Someone else's request: the API rule refuses it.
  if (!e.auth || rec.getString('user') !== e.auth.id) return e.next()

  const settings = store.loadSettings(e.app)
  const result = lib.evaluateRequest(
    { start_date: start, end_date: end, half_day: halfDay },
    {
      workDays: settings.work_days,
      holidays: lib.isDateKey(start) && lib.isDateKey(end) ? ls.holidaysBetween(e.app, start, end) : [],
      user: { joined_on: e.auth.getString('joined_on'), left_on: e.auth.getString('left_on') }
    }
  )
  if (result.error) throw new BadRequestError(result.error)

  let type = null
  try {
    type = e.app.findRecordById('leave_types', rec.getString('leave_type'))
  } catch (_) {}
  if (!type) throw new BadRequestError('Pick a leave type.')

  const other = ls.overlapping(e.app, e.auth.id, start, end, true, rec.id)
  if (other) throw new BadRequestError(ls.overlapMessage(other))

  const quota = lib.quotaProblem(
    { name: type.getString('name'), paid: type.getBool('paid'), yearly_quota_days: type.getFloat('yearly_quota_days') },
    ls.takenDays(e.app, e.auth.id, type.id, lib.yearOf(start), true, rec.id),
    result.days
  )
  if (quota) throw new BadRequestError(quota)

  rec.set('days', result.days)
  rec.set('status', 'pending')
  rec.set('approver', '')
  rec.set('decided_at', '')
  rec.set('comment', '')
  e.next()
}, 'leave_requests')

// A decision or a cancel: only allowed moves, only the status and comment change.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth) return e.next()
  const lib = require(`${__hooks}/lib/leave.js`)
  const ls = require(`${__hooks}/lib/leave_store.js`)
  const store = require(`${__hooks}/lib/attendance_store.js`)
  const rec = e.record
  const old = rec.original()
  const requesterId = old.getString('user')
  const actor = { id: e.auth.id, role: e.auth.getString('role') }
  const isOwner = actor.id === requesterId

  const changed = []
  for (const f of lib.CHECKED_FIELDS) {
    const same =
      f === 'half_day' ? old.getBool(f) === rec.getBool(f) : f === 'days' ? old.getFloat(f) === rec.getFloat(f) : old.getString(f) === rec.getString(f)
    if (!same) changed.push(f)
  }
  const locked = lib.lockedFieldProblem(changed, isOwner)
  if (locked) throw new BadRequestError(locked)

  let requesterRole = 'employee'
  try {
    requesterRole = e.app.findRecordById('users', requesterId).getString('role')
  } catch (_) {}
  const before = old.getString('status')
  const after = rec.getString('status')
  const problem = lib.decisionProblem(actor, { id: requesterId, role: requesterRole }, before, after)
  if (problem) throw new BadRequestError(problem)

  if (after === 'approved') {
    // Count again with today's holidays and work days, then re-check against approved leave only.
    const start = old.getString('start_date')
    const end = old.getString('end_date')
    const days = lib.countDays(start, end, old.getBool('half_day'), store.loadSettings(e.app).work_days, ls.holidaysBetween(e.app, start, end))
    if (days === 0) throw new BadRequestError('No working days are left in these dates (holidays were added). Reject the request instead.')
    const other = ls.overlapping(e.app, requesterId, start, end, false, rec.id)
    if (other) throw new BadRequestError(ls.overlapMessage(other).replace('your', 'their'))
    let type = null
    try {
      type = e.app.findRecordById('leave_types', old.getString('leave_type'))
    } catch (_) {}
    if (type) {
      const quota = lib.quotaProblem(
        { name: type.getString('name'), paid: type.getBool('paid'), yearly_quota_days: type.getFloat('yearly_quota_days') },
        ls.takenDays(e.app, requesterId, type.id, lib.yearOf(start), false, rec.id),
        days
      )
      if (quota) throw new BadRequestError(quota.replace('left this year', 'left for them this year'))
    }
    rec.set('days', days)
  }

  if (lib.isStaffDecision(actor.id, requesterId, after)) {
    rec.set('approver', actor.id)
    rec.set('decided_at', new DateTime())
  } else {
    rec.set('approver', old.getString('approver'))
    rec.set('decided_at', old.get('decided_at'))
  }
  e.next()
}, 'leave_requests')

// Approved leave that appears or goes away on finished days changes their
// attendance (and so payroll): count those days again for that person.
onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/lib/leave_store.js`).recountAttendance(e.app, e.record, '')
  e.next()
}, 'leave_requests')

onRecordAfterUpdateSuccess((e) => {
  require(`${__hooks}/lib/leave_store.js`).recountAttendance(e.app, e.record, e.record.original().getString('status'))
  e.next()
}, 'leave_requests')
