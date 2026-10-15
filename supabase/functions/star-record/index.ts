// Give stars by hand, or excuse an automatic rule's stars for a day (was the create rule +
// hooks for star_records in stars.pb.js). Admins only.
// { user, rule, date, note?, excused? } → the saved record. The person hears about stars given.
import att from '../_shared/logic/attendance.js'
import lib from '../_shared/logic/stars.js'
import { badRequest, body, caller, forbidden, json, loadSettings, serve, sql } from '../_shared/core.ts'

serve(async (req) => {
  const me = await caller(req)
  if (me.role !== 'admin') throw forbidden('Only admins can give stars.')
  const b = await body(req)
  const [rule] = await sql`select id, name, stars, auto from star_rules where id = ${String(b.rule ?? '')}`
  if (!rule) throw badRequest('Pick a rule.')
  const [person] = await sql`select id, joined_on, left_on from profiles where id = ${String(b.user ?? '')}`
  if (!person) throw badRequest('Pick a person.')
  const date = String(b.date ?? '')
  const excused = b.excused === true
  const note = String(b.note ?? '').slice(0, 500)

  const settings = await loadSettings()
  const today = att.todayKey(att.offsetFor(settings.timezone), Date.now())
  const problem = lib.recordProblem({ date, excused, auto: rule.auto }, { today, joined_on: person.joined_on, left_on: person.left_on })
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
  return json(200, saved)
})
