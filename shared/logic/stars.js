// Pure star rules. Plain CommonJS with no server globals, so Vitest
// tests the same file the Edge Functions bundle (scripts/build-edge-shared.mjs).
// Stars count against a person, and each one costs the star value in payroll (payroll.js).
// The automatic ones come from attendance: late and short of the daily target, 1 per started
// block (attendance.js statusFor). An admin gives the others by hand (a rule's stars per break),
// or excuses a day's late or short stars.

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
  if (c.locked) return 'That month’s payroll is approved, so its stars can’t change.'
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
 * One person's star records by day, for payroll.calculateDay: the stars given by hand that count,
 * and which automatic parts (late, short) an admin excused. Hand stars use the rule's current stars.
 * rules: [{ id, stars, auto }], records: [{ rule, date, excused }] → { [date]: { hand, late, short } }
 */
function recordsByDay(rules, records) {
  const byId = {}
  for (const r of rules || []) byId[r.id] = r
  const out = {}
  for (const rec of records || []) {
    const rule = byId[rec.rule]
    if (!rule) continue
    const d = (out[rec.date] = out[rec.date] || { hand: 0, late: false, short: false })
    if (rec.excused) {
      if (rule.auto === 'late') d.late = true
      else if (rule.auto === 'short') d.short = true
    } else if (!rule.auto) {
      d.hand += Number(rule.stars) || 0
    }
  }
  return out
}

module.exports = { recordProblem, givenPayload, recordsByDay }
