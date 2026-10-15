// Decide or cancel a leave request (was the update rule + onRecordUpdateRequest in leave.pb.js).
// { id, status, comment? } → the saved request.
// - The employee may cancel their own pending request (status only, no comment).
// - Staff (an admin, or the manager of the person's team) approve or reject other people's
//   requests; only an admin changes a decision already made or decides a manager's own leave.
// Approving counts the days again and re-checks overlap, quota and monthly limits.
import lib from '../_shared/logic/leave.js'
import { badRequest, body, caller, json, loadSettings, notFound, serve, sql } from '../_shared/core.ts'
import { holidaysBetween, monthlyProblem, notifyDecision, overlapMessage, overlapping, recountAttendance, takenDays } from '../_shared/leave_store.ts'

serve(async (req) => {
  const me = await caller(req)
  const input = await body(req)
  const [old] = await sql`select * from leave_requests where id = ${String(input.id ?? '')}`
  const isOwner = !!old && old.user === me.id
  // Who may touch it at all (the PocketBase update rule): staff for the person, or the owner.
  const [staff] = old && !isOwner
    ? await sql`select 1 from profiles p left join teams t on t.id = p.team
        where p.id = ${old.user} and (${me.role} = 'admin' or (${me.role} = 'manager' and t.manager = ${me.id}))`
    : []
  if (!old || (!isOwner && !staff)) throw notFound('That leave request doesn’t exist, or you can’t change it.')

  const after = String(input.status ?? old.status)
  const comment = input.comment === undefined ? old.comment : String(input.comment).slice(0, 1000)
  const changed = [...(after !== old.status ? ['status'] : []), ...(comment !== old.comment ? ['comment'] : [])]
  const locked = lib.lockedFieldProblem(changed, isOwner)
  if (locked) throw badRequest(locked)
  if (isOwner && !(old.status === 'pending' && after === 'cancelled')) {
    throw badRequest(lib.decisionProblem({ id: me.id, role: me.role }, { id: old.user, role: me.role }, old.status, after) || 'You can only cancel your own request while it is pending.')
  }

  const [requester] = await sql`select role from profiles where id = ${old.user}`
  const problem = lib.decisionProblem({ id: me.id, role: me.role }, { id: old.user, role: requester?.role ?? 'employee' }, old.status, after)
  if (problem) throw badRequest(problem)

  let days = Number(old.days)
  if (after === 'approved') {
    const settings = await loadSettings()
    days = lib.countDays(old.start_date, old.end_date, old.half_day, settings.work_days, await holidaysBetween(old.start_date, old.end_date))
    if (days === 0) throw badRequest('No working days are left in these dates (holidays were added). Reject the request instead.')
    const other = await overlapping(old.user, old.start_date, old.end_date, false, old.id)
    if (other) throw badRequest(overlapMessage(other).replace('your', 'their'))
    const [type] = await sql`select id, name, paid, yearly_quota_days from leave_types where id = ${old.leave_type}`
    if (type) {
      const quota = lib.quotaProblem(
        { name: type.name, paid: type.paid, yearly_quota_days: Number(type.yearly_quota_days) },
        await takenDays(old.user, type.id, lib.yearOf(old.start_date), false, old.id),
        days
      )
      if (quota) throw badRequest(quota.replace('left this year', 'left for them this year'))
    }
    const monthly = await monthlyProblem(old.user, old.start_date, old.end_date, old.half_day, settings, false, old.id)
    if (monthly) throw badRequest(monthly.replace(' left in ', ' left for them in '))
  }

  const decided = lib.isStaffDecision(me.id, old.user, after)
  const [saved] = await sql`update leave_requests set status = ${after}, comment = ${comment}, days = ${days},
      approver = ${decided ? me.id : old.approver}, decided_at = ${decided ? sql`now()` : old.decided_at}
    where id = ${old.id} returning *`
  await notifyDecision(saved, old.status)
  await recountAttendance(saved, old.status)
  return json(200, saved)
})
