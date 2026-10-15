// Attendance (was attendance.pb.js).
// - Admins: { date } or { from, to } (at most 31 finished days) → recount those days.
// - The hourly job (service role, from pg_cron): { nightly: true } → recount the 7 days just
//   finished, so segments that synced late still reach attendance.
import att from '../_shared/logic/attendance.js'
import { body, caller, forbidden, badRequest, isServiceCall, json, loadSettings, serve } from '../_shared/core.ts'
import { recomputeDays } from '../_shared/attendance_store.ts'

serve(async (req) => {
  const input = await body(req)
  const settings = await loadSettings()
  const today = att.todayKey(att.offsetFor(settings.timezone), Date.now())

  if (isServiceCall(req) && input.nightly) {
    const days = att.nightlyDays(today, 7)
    const records = await recomputeDays(settings, days)
    console.log(`attendance: nightly run ${days[days.length - 1]}..${days[0]}, ${records} records`)
    return json(200, { from: days[days.length - 1], to: days[0], days: days.length, records })
  }

  const me = await caller(req)
  if (me.role !== 'admin') throw forbidden('Only admins can recompute attendance.')
  const parsed = att.parseRange(input, today)
  if (parsed.error) throw badRequest(parsed.error)
  const records = await recomputeDays(settings, parsed.data.days)
  return json(200, { from: parsed.data.from, to: parsed.data.to, days: parsed.data.days.length, records })
})
