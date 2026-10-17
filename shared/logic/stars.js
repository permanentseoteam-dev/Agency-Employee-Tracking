// Pure star rules. Plain CommonJS with no server globals, so Vitest
// tests the same file the Edge Functions bundle (scripts/build-edge-shared.mjs).
// Stars count against a person: each rule break
// gives the rule's stars. Automatic rules come from attendance (the app adds them
// up); an admin gives the others by hand, or excuses an automatic one for a day.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Why a new star record is refused, or null.
 * input: { date, excused, auto } (auto = the rule's automatic key, '' when given by hand).
 * ctx: { today, joined_on, left_on } for the person.
 */
function recordProblem(input, ctx) {
  const c = ctx || {}
  const date = input.date
  if (typeof date !== 'string' || !DATE_KEY.test(date)) return 'Pick a valid date.'
  if (c.today && date > c.today) return 'Stars can’t be given for a day that hasn’t happened yet.'
  if (c.joined_on && date < c.joined_on) return 'That day is before they joined (' + c.joined_on + ').'
  if (c.left_on && date > c.left_on) return 'That day is after they left (' + c.left_on + ').'
  if (input.excused && !input.auto) return 'Only automatic stars can be excused. Remove a star given by hand instead.'
  if (!input.excused && input.auto) return 'This rule’s stars come from attendance automatically. You can excuse them for a day instead.'
  return null
}

/** What the bell shows when an admin gives stars; names are stored so the text survives renames. */
function givenPayload(rec, names) {
  return {
    record: rec.id,
    rule_name: names.rule || '',
    stars: Number(rec.stars) || 0,
    date: rec.date,
    note: rec.note || '',
    given_by_name: names.givenBy || ''
  }
}

/**
 * What stars cost in a month, per person: each counted rule break costs
 * (that rule's stars × the rule's pkr_per_star). Same counting as the app (src/lib/stars.ts):
 * automatic rules from attendance unless excused for that day; by-hand records unless excused.
 * attendance: [{ user, date, status }], rules: [{ id, stars, auto, pkr_per_star }],
 * records: [{ user, rule, date, excused }] → { [user]: { stars, pkr } }
 */
function monthStarCharges(attendance, rules, records) {
  const byId = {}
  const byStatus = {}
  for (const r of rules || []) {
    byId[r.id] = r
    if (r.auto) byStatus[r.auto] = r
  }
  const excused = {}
  for (const r of records || []) if (r.excused) excused[r.user + '|' + r.rule + '|' + r.date] = true
  const out = {}
  const add = (user, rule) => {
    const stars = Number(rule.stars) || 0
    const o = (out[user] = out[user] || { stars: 0, pkr: 0 })
    o.stars += stars
    o.pkr += stars * (Number(rule.pkr_per_star) || 0)
  }
  for (const a of attendance || []) {
    const rule = byStatus[a.status]
    if (rule && !excused[a.user + '|' + rule.id + '|' + a.date]) add(a.user, rule)
  }
  for (const r of records || []) {
    const rule = byId[r.rule]
    if (rule && !r.excused) add(r.user, rule)
  }
  return out
}

module.exports = { recordProblem, givenPayload, monthStarCharges }
