// Apply for leave (was the create rule + onRecordCreateRequest in leave.pb.js).
// { leave_type, start_date, end_date, half_day?, reason? } → the saved request (always pending).
// The server counts the days and refuses bad dates, overlaps, paid leave past the yearly quota
// and leave past the monthly limits in Rules.
import lib from '../_shared/logic/leave.js'
import { badRequest, body, caller, json, loadSettings, serve, sql } from '../_shared/core.ts'
import { holidaysBetween, monthlyProblem, notifyNewRequest, overlapMessage, overlapping, recountAttendance, takenDays } from '../_shared/leave_store.ts'

serve(async (req) => {
  const me = await caller(req)
  const input = await body(req)
  const start = String(input.start_date ?? '')
  const end = String(input.end_date ?? '')
  const halfDay = input.half_day === true
  const reason = String(input.reason ?? '').slice(0, 1000)

  const settings = await loadSettings()
  const result = lib.evaluateRequest(
    { start_date: start, end_date: end, half_day: halfDay },
    {
      workDays: settings.work_days,
      holidays: lib.isDateKey(start) && lib.isDateKey(end) ? await holidaysBetween(start, end) : [],
      user: { joined_on: me.joined_on, left_on: me.left_on }
    }
  )
  if (result.error) throw badRequest(result.error)

  const [type] = await sql`select id, name, paid, yearly_quota_days from leave_types where id = ${String(input.leave_type ?? '')}`
  if (!type) throw badRequest('Pick a leave type.')
  const other = await overlapping(me.id, start, end, true)
  if (other) throw badRequest(overlapMessage(other))
  const quota = lib.quotaProblem(
    { name: type.name, paid: type.paid, yearly_quota_days: Number(type.yearly_quota_days) },
    await takenDays(me.id, type.id, lib.yearOf(start), true),
    result.days
  )
  if (quota) throw badRequest(quota)
  const monthly = await monthlyProblem(me.id, start, end, halfDay, settings, true)
  if (monthly) throw badRequest(monthly)

  const [saved] = await sql`insert into leave_requests ("user", leave_type, start_date, end_date, half_day, days, reason, status)
    values (${me.id}, ${type.id}, ${start}, ${end}, ${halfDay}, ${result.days}, ${reason}, 'pending') returning *`
  await notifyNewRequest(saved)
  await recountAttendance(saved, '')
  return json(200, saved)
})
