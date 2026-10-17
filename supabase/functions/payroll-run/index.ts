// Create or recount the draft payroll for a month (was POST /api/payroll/run, payroll.pb.js +
// lib/payroll_store.js). Admins only. { month: "YYYY-MM" } (this month or earlier)
// → { run, month, items, skipped: [names without a salary], counted_to }.
// The month's attendance is recounted first; adjustments and notes on a draft are kept;
// a finalized month is refused. Finalizing, and the locks after it, are database triggers; the run
// keeps counted_to, and finalizing needs it to reach the month's last day (a count after it ended).
import att from '../_shared/logic/attendance.js'
import lib from '../_shared/logic/payroll.js'
import starLib from '../_shared/logic/stars.js'
import { badRequest, body, caller, forbidden, json, loadSettings, serve, sql } from '../_shared/core.ts'
import { recomputeDays } from '../_shared/attendance_store.ts'

const byUser = <T extends { user: string }>(rows: T[]) => {
  const out: Record<string, T[]> = {}
  for (const r of rows) (out[r.user] ??= []).push(r)
  return out
}

serve(async (req) => {
  const me = await caller(req)
  if (me.role !== 'admin') throw forbidden('Only admins can run payroll.')
  const settings = await loadSettings()
  const today = att.todayKey(att.offsetFor(settings.timezone), Date.now())
  const parsed = lib.parseMonth(await body(req), today.slice(0, 7))
  if (parsed.error) throw badRequest(parsed.error)
  const month: string = parsed.data.month
  const range = lib.monthRange(month)

  let [run] = await sql`select id, status from payroll_runs where month = ${month}`
  if (run?.status === 'finalized') throw badRequest('Payroll for ' + lib.monthLabel(month) + ' is finalized and can’t be recounted.')

  const yesterday = att.addDays(today, -1)
  const countedTo = range.to < yesterday ? range.to : yesterday
  if (range.from <= countedTo) await recomputeDays(settings, att.daysBetween(range.from, countedTo))

  const holidays = (await sql`select date from holidays where date >= ${range.from} and date <= ${range.to}`).map((h) => h.date as string)
  const workingDays = lib.workingDays(month, settings.work_days, holidays)
  const users = await sql`select id, full_name, joined_on, left_on, active from profiles`
  const salaries: Record<string, number> = {}
  for (const s of await sql`select "user", monthly_salary_pkr from salaries`) salaries[s.user] = Number(s.monthly_salary_pkr)
  const attendanceRows = await sql`select "user", date, status from attendance where date >= ${range.from} and date <= ${range.to}`
  const attendance = byUser(attendanceRows as any)
  // Each counted break costs its rule's price (Rules → Stars); excused ones are free.
  const starRules = await sql`select id, stars, auto, price_pkr from star_rules`
  const starRecords = await sql`select "user", rule, date, excused from star_records where date >= ${range.from} and date <= ${range.to}`
  const starCharges: Record<string, { stars: number; pkr: number }> = starLib.monthStarCharges(attendanceRows, starRules, starRecords)
  const leaves = byUser(
    (await sql`select lr."user", lr.start_date, lr.end_date, lr.half_day from leave_requests lr join leave_types lt on lt.id = lr.leave_type
      where lr.status = 'approved' and not lt.paid and lr.start_date <= ${range.to} and lr.end_date >= ${range.from}`).map((l) => ({ ...l, paid: false })) as any
  )
  const kept: Record<string, { adjustment: number; note: string }> = {}
  if (run) {
    for (const i of await sql`select "user", adjustment_pkr, note from payroll_items where run = ${run.id}`) {
      kept[i.user] = { adjustment: Number(i.adjustment_pkr), note: i.note }
    }
  }

  // The last day counted is kept on the run: finalizing needs a count made after the month ended.
  const counted = range.from <= countedTo ? countedTo : null
  const skipped: string[] = []
  let items = 0
  await sql.begin(async (tx) => {
    if (!run) [run] = await tx`insert into payroll_runs (month, status, counted_to) values (${month}, 'draft', ${counted}) returning id, status`
    else await tx`update payroll_runs set counted_to = ${counted} where id = ${run.id}`
    await tx`delete from payroll_items where run = ${run.id}`
    for (const u of users) {
      if (!lib.employedDuring(month, { active: !!u.active, joined_on: u.joined_on, left_on: u.left_on })) continue
      const base = salaries[u.id] || 0
      if (base <= 0) {
        skipped.push(u.full_name || u.id)
        continue
      }
      const counts = lib.attendanceCounts(attendance[u.id])
      const unpaid = lib.unpaidLeaveDays(leaves[u.id], month, settings.work_days, holidays)
      const keep = kept[u.id] ?? { adjustment: 0, note: '' }
      const charge = starCharges[u.id] ?? { stars: 0, pkr: 0 }
      const r = lib.calculate({
        base,
        workingDays,
        absentDays: counts.absent,
        unpaidLeaveDays: unpaid,
        halfDays: counts.half,
        starsPkr: charge.pkr,
        adjustment: keep.adjustment
      })
      await tx`insert into payroll_items (run, "user", base, working_days, absent_days, unpaid_leave_days, half_days, stars, stars_pkr, deductions, adjustment_pkr, note, net)
        values (${run.id}, ${u.id}, ${base}, ${workingDays}, ${counts.absent}, ${unpaid}, ${counts.half}, ${charge.stars}, ${r.starsPkr}, ${r.deductions}, ${Math.round(keep.adjustment)}, ${keep.note}, ${r.net})`
      items++
    }
  })
  return json(200, { run: run.id, month, items, skipped, counted_to: counted ?? '' })
})
