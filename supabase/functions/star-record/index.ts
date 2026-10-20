// Stars by hand and excuses, added and removed (was the create rule + hooks for star_records in
// stars.pb.js). Admins only.
// - { user, rule, date, note?, excused? } → the saved record: stars given by hand, or an automatic
//   rule's stars excused for a day. The person hears about stars given.
// - { remove: id } → { removed: id }: takes stars given by hand away, or an excuse back.
// A month whose payroll is approved (finalized) is refused either way. After a change the person's
// finished day is counted again, so its total_stars, and the pay worked out from them, follow.
import att from '../_shared/logic/attendance.js'
import lib from '../_shared/logic/stars.js'
import { badRequest, body, caller, forbidden, json, loadSettings, notFound, serve, sql } from '../_shared/core.ts'
import { recomputeDays } from '../_shared/attendance_store.ts'

type Settings = Awaited<ReturnType<typeof loadSettings>>

/** Whether payroll for the month of a day key is approved: its stars can't change then. */
const approved = async (date: string) =>
  (await sql`select 1 from payroll_runs where month = ${date.slice(0, 7)} and status = 'finalized'`).length > 0

/** Counts the person's day again. Only a finished day: the hourly job writes today's row once the day ends. */
async function recountDay(settings: Settings, today: string, userId: string, date: string) {
  if (date >= today) return
  try {
    await recomputeDays(settings, [date], userId)
  } catch (err) {
    console.error('stars: attendance recount', err) // the hourly job and the payroll run still count it again
  }
}

serve(async (req) => {
  const me = await caller(req)
  if (me.role !== 'admin') throw forbidden('Only admins can give or remove stars.')
  const b = await body(req)
  const settings = await loadSettings()
  const today = att.todayKey(att.offsetFor(settings.timezone), Date.now())

  if (b.remove !== undefined) {
    const [rec] = await sql`select id, "user", rule, date from star_records where id = ${String(b.remove)}`
    if (!rec) throw notFound('That star record is gone.')
    if (await approved(rec.date)) throw badRequest('That month’s payroll is approved, so its stars can’t change.')
    await sql`delete from star_records where id = ${rec.id}`
    await recountDay(settings, today, rec.user, rec.date)
    return json(200, { removed: rec.id })
  }

  const [rule] = await sql`select id, name, stars, auto from star_rules where id = ${String(b.rule ?? '')}`
  if (!rule) throw badRequest('Pick a rule.')
  const [person] = await sql`select id, joined_on, left_on from profiles where id = ${String(b.user ?? '')}`
  if (!person) throw badRequest('Pick a person.')
  const date = String(b.date ?? '')
  const excused = b.excused === true
  const note = String(b.note ?? '').slice(0, 500)

  const ctx = { today, joined_on: person.joined_on, left_on: person.left_on, locked: await approved(date) }
  const problem = lib.recordProblem({ date, excused, auto: rule.auto }, ctx)
  if (problem) throw badRequest(problem)
  const [same] = await sql`select excused from star_records where "user" = ${person.id} and rule = ${rule.id} and date = ${date}`
  if (same) throw badRequest(same.excused ? 'That day is already excused for this rule.' : 'They already have stars for this rule on that day.')

  const [saved] = await sql`insert into star_records ("user", rule, date, note, given_by, excused)
    values (${person.id}, ${rule.id}, ${date}, ${note}, ${me.id}, ${excused}) returning *`

  if (!excused) {
    try {
      const payload = lib.givenPayload({ id: saved.id, stars: rule.stars, date, note }, { rule: rule.name, givenBy: me.full_name })
      await sql`insert into notifications ("user", type, payload) values (${person.id}, 'stars_given', ${sql.json(payload)})`
    } catch (err) {
      console.error('stars: notifying the person', err)
    }
  }
  await recountDay(settings, today, person.id, date)
  return json(200, saved)
})
