// Pure rules for leave notifications. Plain CommonJS with no server globals, so Vitest
// tests the same file the Edge Functions bundle (scripts/build-edge-shared.mjs).

const DECISIONS = ['approved', 'rejected']
const MANAGER_ROLES = ['manager', 'admin']

function unique(ids) {
  const out = []
  for (const id of ids) if (id && out.indexOf(id) === -1) out.push(id)
  return out
}

/**
 * Whether a team's manager (a profile row { active, role, pending_approval }, or null) still
 * gets the team's leave requests: only an active, approved account that is still a manager or
 * admin. A manager who was demoted or switched off no longer does (they can't decide the
 * requests either), and the request goes to the admins instead.
 */
function isEligibleTeamManager(profile) {
  return !!profile && profile.active === true && profile.pending_approval !== true && MANAGER_ROLES.indexOf(profile.role) !== -1
}

/**
 * Who hears about a new leave request (plan §4.3): the requester's team manager.
 * A manager's or admin's own request, or one with no active team manager, goes to
 * the admins instead (the caller passes '' for a team manager who isn't eligible, see
 * isEligibleTeamManager). Nobody is notified about their own request.
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

module.exports = { isEligibleTeamManager, requestRecipients, isNewRequest, isDecision, requestPayload, decisionPayload }
