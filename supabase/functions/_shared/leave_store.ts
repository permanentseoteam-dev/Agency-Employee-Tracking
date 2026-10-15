// Database side of leave requests (was server/pb_hooks/lib/leave_store.js + notifications.pb.js).
// The rules stay in logic/leave.js and logic/notifications.js.
import att from './logic/attendance.js'
import lib from './logic/leave.js'
import notes from './logic/notifications.js'
import { loadSettings, sql } from './core.ts'
import { recomputeDays } from './attendance_store.ts'

type Settings = Awaited<ReturnType<typeof loadSettings>>

/** Holiday day keys from–to, inclusive. */
export async function holidaysBetween(start: string, end: string): Promise<string[]> {
  return (await sql`select date from holidays where date >= ${start} and date <= ${end}`).map((h) => h.date as string)
}

const statuses = (includePending: boolean) => (includePending ? ['approved', 'pending'] : ['approved'])

/** The person's first other request overlapping the dates (approved, plus pending when asked), or null. */
export async function overlapping(userId: string, start: string, end: string, includePending: boolean, exceptId = '') {
  const [row] = await sql`select start_date, end_date, status from leave_requests
    where "user" = ${userId} and id <> ${exceptId} and status = any(${statuses(includePending)})
      and start_date <= ${end} and end_date >= ${start} order by start_date limit 1`
  return row ?? null
}

/** Days of one leave type the person already has in a year, not counting `exceptId`. */
export async function takenDays(userId: string, typeId: string, year: string, includePending: boolean, exceptId = '') {
  const [row] = await sql`select coalesce(sum(days), 0)::float as taken from leave_requests
    where "user" = ${userId} and leave_type = ${typeId} and id <> ${exceptId}
      and status = any(${statuses(includePending)}) and substr(start_date, 1, 4) = ${year}`
  return Number(row?.taken) || 0
}

/** Why a request goes over the monthly limits in Rules, or null. */
export async function monthlyProblem(userId: string, start: string, end: string, halfDay: boolean, settings: Settings, includePending: boolean, exceptId = '') {
  const limits = { full: settings.monthly_full_leaves, half: settings.monthly_half_leaves }
  if (!(limits.full > 0) && !(limits.half > 0)) return null
  const adding = lib.leaveByMonth(start, end, halfDay, settings.work_days, await holidaysBetween(start, end))
  for (const month of Object.keys(adding).sort()) {
    const range = { from: month + '-01', to: month + '-31' }
    const others = await sql`select start_date, end_date, half_day from leave_requests
      where "user" = ${userId} and id <> ${exceptId} and status = any(${statuses(includePending)})
        and start_date <= ${range.to} and end_date >= ${range.from}`
    const taken = lib.monthTotals(others, month, settings.work_days, await holidaysBetween(range.from, range.to))
    const problem = lib.monthlyLimitProblem(limits, month, taken, adding[month])
    if (problem) return problem
  }
  return null
}

function rangeText(start: string, end: string) {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const f = (d: string) => Number(d.slice(8, 10)) + ' ' + M[Number(d.slice(5, 7)) - 1]
  return start === end ? f(start) + ' ' + start.slice(0, 4) : f(start) + ' – ' + f(end) + ' ' + end.slice(0, 4)
}
export const overlapMessage = (o: { status: string; start_date: string; end_date: string }) =>
  'These dates overlap your ' + o.status + ' leave on ' + rangeText(o.start_date, o.end_date) + '.'

/** Approved leave that appeared or went away on finished days: count that person's attendance again. */
export async function recountAttendance(req: { user: string; status: string; start_date: string; end_date: string }, before: string) {
  try {
    const settings = await loadSettings()
    const today = att.todayKey(att.offsetFor(settings.timezone), Date.now())
    const days = lib.attendanceDaysToRecount(before, req.status, req.start_date, req.end_date, today)
    if (days.length) await recomputeDays(settings, days, req.user)
  } catch (err) {
    console.error('leave: attendance recount', err) // the hourly job and the admin recompute still cover it
  }
}

const nameOf = async (table: 'profiles' | 'leave_types', id: string | null, field: 'full_name' | 'name') => {
  if (!id) return ''
  const [r] = table === 'profiles' ? await sql`select full_name from profiles where id = ${id}` : await sql`select name from leave_types where id = ${id}`
  return (r?.[field] as string) ?? ''
}

/** A new request → its team manager (or the admins for a manager's own request). */
export async function notifyNewRequest(req: Record<string, any>) {
  try {
    if (!notes.isNewRequest(req.status)) return
    const [requester] = await sql`select p.id, p.role, p.full_name, t.manager from profiles p left join teams t on t.id = p.team where p.id = ${req.user}`
    let managerId = ''
    if (requester?.manager) {
      const [m] = await sql`select id from profiles where id = ${requester.manager} and active`
      if (m) managerId = m.id
    }
    const admins = (await sql`select id from profiles where role = 'admin' and active`).map((a) => a.id as string)
    const payload = notes.requestPayload(
      { id: req.id, user: req.user, start_date: req.start_date, end_date: req.end_date, half_day: req.half_day, days: Number(req.days) },
      { requester: requester?.full_name ?? '', leaveType: await nameOf('leave_types', req.leave_type, 'name') }
    )
    for (const id of notes.requestRecipients({ id: req.user, role: requester?.role }, managerId, admins)) {
      await sql`insert into notifications ("user", type, payload) values (${id}, 'leave_requested', ${sql.json(payload)})`
    }
  } catch (err) {
    console.error('notifications: new leave request', err)
  }
}

/** Approved or rejected (also an admin reversing a decision) → the employee. */
export async function notifyDecision(req: Record<string, any>, before: string) {
  try {
    if (!notes.isDecision(before, req.status)) return
    const payload = notes.decisionPayload(
      { id: req.id, user: req.user, start_date: req.start_date, end_date: req.end_date, half_day: req.half_day, days: Number(req.days), status: req.status, comment: req.comment },
      {
        requester: await nameOf('profiles', req.user, 'full_name'),
        leaveType: await nameOf('leave_types', req.leave_type, 'name'),
        approver: await nameOf('profiles', req.approver, 'full_name')
      }
    )
    await sql`insert into notifications ("user", type, payload) values (${req.user}, 'leave_decided', ${sql.json(payload)})`
  } catch (err) {
    console.error('notifications: leave decision', err)
  }
}
