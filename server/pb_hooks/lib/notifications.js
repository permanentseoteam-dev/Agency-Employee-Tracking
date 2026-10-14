// Pure rules for leave notifications (notifications.pb.js). No PocketBase
// globals here, so Vitest can test the same file the hook require()s.

const DECISIONS = ['approved', 'rejected']

function unique(ids) {
  const out = []
  for (const id of ids) if (id && out.indexOf(id) === -1) out.push(id)
  return out
}

/**
 * Who hears about a new leave request (plan §4.3): the requester's team manager.
 * A manager's or admin's own request, or one with no active team manager, goes to
 * the admins instead. Nobody is notified about their own request.
 */
function requestRecipients(requester, teamManagerId, adminIds) {
  const toAdmins =
    requester.role === 'manager' || requester.role === 'admin' || !teamManagerId || teamManagerId === requester.id
  return unique((toAdmins ? adminIds || [] : [teamManagerId]).filter((id) => id !== requester.id))
}

/** A new pending request notifies; one created already decided (e.g. imported by a superuser) does not. */
function isNewRequest(status) {
  return !status || status === 'pending'
}

/** The employee hears when their request becomes approved or rejected (including an admin reversing a decision). */
function isDecision(before, after) {
  return DECISIONS.indexOf(after) !== -1 && before !== after
}

/** What the bell shows for a request; names are stored so the text survives later renames. */
function requestPayload(req, names) {
  return {
    request: req.id,
    requester: req.user,
    requester_name: names.requester || '',
    leave_type_name: names.leaveType || '',
    start_date: req.start_date,
    end_date: req.end_date,
    half_day: !!req.half_day,
    days: req.days
  }
}

function decisionPayload(req, names) {
  const p = requestPayload(req, names)
  p.status = req.status
  p.decided_by_name = names.approver || ''
  p.comment = req.comment || ''
  return p
}

module.exports = { requestRecipients, isNewRequest, isDecision, requestPayload, decisionPayload }
