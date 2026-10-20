// Extras on top of seed.mjs for npm run test:env:
// - the "Emergency" leave type (unpaid, no limit), as an admin adds it in Rules → Leave types
// - dummy pay history: the three months before this one, finalized, so every role has
//   something under Finance. The figures go through the real formula
//   (shared/logic/payroll.js calculateMonth, on a few made-up days), so the breakdown dialog adds up.
// This month stays free for running payroll by hand (admin plan A-61).
// - three clients for the Project tab, with people on more than one, and a few meetings
//   on their calendars this week, each added by someone on that client
import { createRequire } from 'node:module'

const payroll = createRequire(import.meta.url)('../../shared/logic/payroll.js')

const OFFSET_MIN = 300 // Asia/Karachi, no DST
const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
/** The n-th working day (Mon–Fri) after a day. */
const workdayAfter = (key, n) => {
  let d = key
  while (n > 0) {
    d = addDays(d, 1)
    const wd = new Date(d + 'T00:00:00Z').getUTCDay()
    if (wd !== 0 && wd !== 6) n--
  }
  return d
}
/** A Karachi wall-clock time on a day, as an ISO instant. */
const at = (key, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.parse(key + 'T00:00:00Z') + (h * 60 + m - OFFSET_MIN) * 60000).toISOString()
}

const CLIENTS = [
  { name: 'Acme Dental', description: 'Local SEO retainer', people: ['asma', 'chand', 'danish', 'bilal'] },
  { name: 'Northwind Realty', description: 'Content and link building', people: ['erum', 'sana', 'chand'] },
  { name: 'Bluefin Media', description: 'Technical SEO audit', people: ['admin', 'asma'] }
]
// [client, who adds it, title, working days from today, start, end] ('' times = all day)
const MEETINGS = [
  ['Acme Dental', 'bilal', 'Weekly SEO check-in', 1, '11:00', '11:30'],
  ['Acme Dental', 'asma', 'Monthly report call', 3, '15:00', '16:00'],
  ['Northwind Realty', 'sana', 'Content plan review', 2, '12:00', '13:00'],
  ['Bluefin Media', 'admin', 'Site audit due', 4, '', '']
]

const shiftMonth = (month, n) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

// What happened in each month, by email and months back (1 = last month): days off, stars and
// adjustments. late and short are one day's stars (a late start, short of the daily target); hand
// is stars given by hand on one day. Only the payroll lines are stored, not these days:
// Finance → Daily pay counts from attendance, so it won't match those months.
const MONTHS = {
  'admin@test.local': { 2: { short: 2 } },
  'bilal@test.local': { 1: { absent: 1, late: 1 }, 3: { short: 4 } },
  'sana@test.local': { 1: { absent: 1 }, 2: { late: 2, adjustment: 10000, note: 'Eid bonus' } },
  'asma@test.local': { 1: { short: 3, hand: 2 }, 2: { adjustment: 10000, note: 'Eid bonus' }, 3: { absent: 1 } },
  'chand@test.local': { 1: { absent: 2, late: 3, short: 4 }, 2: { unpaid: 1 }, 3: { adjustment: -15000, note: 'Salary advance' } },
  'faisal@test.local': { 1: { short: 6, hand: 1 }, 3: { unpaid: 2 } }
}

/**
 * A month's made-up attendance rows and stars by hand, the way the payroll function reads them,
 * on the first of the working days someone was employed: absent days, unpaid leave, a late day,
 * a short day, then a day with stars given by hand.
 */
const madeUp = (days, m) => {
  const free = [...days]
  const records = []
  const stars = {}
  const add = (row) => free.length && records.push({ date: free.shift(), late_stars: 0, shortfall_stars: 0, ...row })
  for (let n = 0; n < (m.absent ?? 0); n++) add({ status: 'absent', pay_basis: 'none' })
  for (let n = 0; n < (m.unpaid ?? 0); n++) add({ status: 'on_leave', pay_basis: 'none' })
  if (m.late) add({ status: 'late', late_stars: m.late, pay_basis: 'full' })
  if (m.short) add({ status: 'present', shortfall_stars: m.short, pay_basis: 'full' })
  if (m.hand && free.length) stars[free.shift()] = { hand: m.hand, late: false, short: false }
  return { records, stars }
}

export async function seedExtras(api, info, { log = () => {} } = {}) {
  await api.create('leave_types', { name: 'Emergency', yearly_quota_days: 0, paid: false })
  log('Emergency leave type (unpaid)')

  const [settings] = await api.list('org_settings')
  const holidays = await api.list('holidays')
  const users = await api.list('users')
  const salaries = new Map((await api.list('salaries')).map((s) => [s.user, s.monthly_salary_pkr]))
  const current = info.today.slice(0, 7)

  for (let back = 3; back >= 1; back--) {
    const month = shiftMonth(current, -back)
    const run = await api.create('payroll_runs', { month, status: 'draft' })
    const lines = []
    for (const u of users) {
      const base = salaries.get(u.id)
      if (!base || !payroll.employedDuring(month, u)) continue
      const m = MONTHS[u.email]?.[back] ?? {}
      const input = { month, salary: base, adjustment: m.adjustment, settings, holidays, person: u }
      // With no attendance yet every working day pays in full: that lists the days they were employed.
      const employed = payroll.calculateMonth(input).days.filter((d) => d.employed).map((d) => d.date)
      const pay = payroll.calculateMonth({ ...input, ...madeUp(employed, m) })
      // The same columns the payroll function writes; half days are part of the day's pay now (0).
      lines.push({
        run: run.id,
        user: u.id,
        base,
        working_days: pay.working_days,
        absent_days: pay.absent_days,
        unpaid_leave_days: pay.unpaid_days,
        half_days: 0,
        stars: pay.stars,
        daily_rate: pay.daily_rate,
        hourly_rate: pay.hourly_rate,
        star_value: pay.star_value,
        late_stars: pay.late_stars,
        shortfall_stars: pay.shortfall_stars,
        hand_stars: pay.hand_stars,
        star_deduction_pkr: pay.star_deduction,
        gross_pkr: pay.gross,
        deductions: pay.deductions,
        adjustment_pkr: m.adjustment ?? 0,
        note: m.note ?? '',
        net: pay.net
      })
    }
    await api.batchCreate('payroll_items', lines)
    await api.update('payroll_runs', run.id, { status: 'finalized' })
    log(`payroll ${month}: ${lines.length} people, finalized`)
  }

  // Project tab: clients and their calendars. Meetings are added with that person's own
  // sign-in, as on a real PC, so the calendar shows who added each one.
  const idOf = new Map(users.map((u) => [u.email.split('@')[0], u.id]))
  const clientId = {}
  for (const c of CLIENTS) {
    clientId[c.name] = (await api.create('clients', { name: c.name, description: c.description, members: c.people.map((k) => idOf.get(k)) })).id
  }
  for (const [client, who, title, days, start, end] of MEETINGS) {
    const day = workdayAfter(info.today, days)
    const times = start ? { starts_at: at(day, start), ends_at: at(day, end) } : { starts_at: at(day, '00:00'), ends_at: at(addDays(day, 1), '00:00') }
    const token = await api.tokenOf(`${who}@test.local`)
    await api.create('project_events', { client: clientId[client], title, description: '', ...times }, token)
  }
  log(`projects: ${CLIENTS.length} clients, ${MEETINGS.length} meetings`)
}
