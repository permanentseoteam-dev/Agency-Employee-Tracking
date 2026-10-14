/// <reference path="../pb_data/types.d.ts" />
// In-app notifications for leave (plan §4.3, §4.9). They run after the change is
// saved, and a failure here is logged without undoing the leave request itself.
// Each handler runs in its own isolated context: helpers come from require().

// A new request → its team manager (or the admins for a manager's own request).
onRecordAfterCreateSuccess((e) => {
  try {
    const lib = require(`${__hooks}/lib/notifications.js`)
    const req = e.record
    if (lib.isNewRequest(req.getString('status'))) {
      const requester = e.app.findRecordById('users', req.getString('user'))
      let managerId = ''
      try {
        const managerOf = e.app.findRecordById('teams', requester.getString('team')).getString('manager')
        if (managerOf && e.app.findRecordById('users', managerOf).getBool('active')) managerId = managerOf
      } catch (_) {}
      const admins = []
      for (const a of e.app.findRecordsByFilter('users', "role = 'admin' && active = true", '', 0, 0)) admins.push(a.id)

      let leaveType = ''
      try {
        leaveType = e.app.findRecordById('leave_types', req.getString('leave_type')).getString('name')
      } catch (_) {}
      const payload = lib.requestPayload(
        {
          id: req.id,
          user: requester.id,
          start_date: req.getString('start_date'),
          end_date: req.getString('end_date'),
          half_day: req.getBool('half_day'),
          days: req.getFloat('days')
        },
        { requester: requester.getString('full_name'), leaveType: leaveType }
      )
      const collection = e.app.findCollectionByNameOrId('notifications')
      for (const id of lib.requestRecipients({ id: requester.id, role: requester.getString('role') }, managerId, admins)) {
        const n = new Record(collection)
        n.set('user', id)
        n.set('type', 'leave_requested')
        n.set('payload', payload)
        e.app.save(n)
      }
    }
  } catch (err) {
    e.app.logger().error('notifications: new leave request', 'error', String(err))
  }
  e.next()
}, 'leave_requests')

// Approved or rejected (also an admin reversing a decision) → the employee.
onRecordAfterUpdateSuccess((e) => {
  try {
    const lib = require(`${__hooks}/lib/notifications.js`)
    const req = e.record
    if (lib.isDecision(req.original().getString('status'), req.getString('status'))) {
      const name = (collection, id, field) => {
        try {
          return e.app.findRecordById(collection, id).getString(field)
        } catch (_) {
          return ''
        }
      }
      const payload = lib.decisionPayload(
        {
          id: req.id,
          user: req.getString('user'),
          start_date: req.getString('start_date'),
          end_date: req.getString('end_date'),
          half_day: req.getBool('half_day'),
          days: req.getFloat('days'),
          status: req.getString('status'),
          comment: req.getString('comment')
        },
        {
          requester: name('users', req.getString('user'), 'full_name'),
          leaveType: name('leave_types', req.getString('leave_type'), 'name'),
          approver: req.getString('approver') ? name('users', req.getString('approver'), 'full_name') : ''
        }
      )
      const n = new Record(e.app.findCollectionByNameOrId('notifications'))
      n.set('user', req.getString('user'))
      n.set('type', 'leave_decided')
      n.set('payload', payload)
      e.app.save(n)
    }
  } catch (err) {
    e.app.logger().error('notifications: leave decision', 'error', String(err))
  }
  e.next()
}, 'leave_requests')
