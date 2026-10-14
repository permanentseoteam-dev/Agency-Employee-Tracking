// Fills a fresh test database with a small, realistic company, so every screen
// and rule has something to show: two teams, every role, ~2 weeks of tracked
// time, a holiday, events, leave in every state, and computed attendance.
// Dates are relative to "today" in Karachi, so the data always looks current.
import { PASSWORD } from './server.mjs'

const OFFSET_MIN = 300 // Asia/Karachi, no DST
const DAY = 86400000
const MIN = 60000
const keyOf = (ms) => new Date(ms + OFFSET_MIN * MIN).toISOString().slice(0, 10)
const addDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
const weekday = (key) => new Date(key + 'T00:00:00Z').getUTCDay() || 7 // 1 = Mon … 7 = Sun
const isWorkday = (key) => weekday(key) <= 5
/** A Karachi wall-clock time on a day, as UTC milliseconds. */
const at = (key, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(key + 'T00:00:00Z') + (h * 60 + m - OFFSET_MIN) * MIN
}
const nextWorkday = (key) => {
  let d = key
  while (!isWorkday(d)) d = addDays(d, 1)
  return d
}

export const NEW_HIRE_PASSWORD = 'Temp-pass-1'

/** Who is in the test company (also printed by npm run test:env). */
export const PEOPLE = [
  { key: 'admin', role: 'admin', name: 'Ayesha Admin', email: 'admin@test.local', designation: 'Operations head', salary: 250000 },
  { key: 'bilal', role: 'manager', name: 'Bilal Manager', email: 'bilal@test.local', team: 'Alpha', manages: 'Alpha', designation: 'SEO lead', salary: 160000 },
  { key: 'sana', role: 'manager', name: 'Sana Manager', email: 'sana@test.local', team: 'Bravo', manages: 'Bravo', designation: 'Content lead', salary: 150000 },
  { key: 'asma', role: 'employee', name: 'Asma Khan', email: 'asma@test.local', team: 'Alpha', designation: 'Frontend developer', salary: 90000 },
  { key: 'chand', role: 'employee', name: 'Chand Raza', email: 'chand@test.local', team: 'Alpha', designation: 'Link builder', salary: 65000 },
  { key: 'danish', role: 'employee', name: 'Danish Ali', email: 'danish@test.local', team: 'Bravo', designation: 'Content writer', note: 'no salary set' },
  { key: 'erum', role: 'employee', name: 'Erum Shah', email: 'erum@test.local', team: 'Bravo', designation: 'Designer', salary: 75000, note: 'joined this period' },
  { key: 'newhire', role: 'employee', name: 'Nadia New', email: 'newhire@test.local', team: 'Alpha', designation: 'Trainee', salary: 40000, password: NEW_HIRE_PASSWORD, note: 'must change password + tracking notice' },
  { key: 'faisal', role: 'employee', name: 'Faisal Left', email: 'faisal@test.local', team: 'Alpha', designation: 'QA analyst', salary: 70000, inactive: true, note: 'deactivated: cannot sign in' }
]

/** One person-day of tracked time: 5-minute segments from `start`, a short idle break every hour. */
function day(userId, dayKey, start, activeMin, idleMin) {
  const out = []
  let t = at(dayKey, start)
  let active = activeMin
  let idle = idleMin
  let sinceBreak = 0
  const push = (state) => {
    out.push({ user: userId, state, started_at: new Date(t).toISOString(), ended_at: new Date(t + 5 * MIN).toISOString() })
    t += 5 * MIN
  }
  while (active > 0 || idle > 0) {
    if (idle > 0 && (sinceBreak >= 60 || active <= 0)) {
      push('idle')
      idle -= 5
      sinceBreak = 0
    } else {
      push('active')
      active -= 5
      sinceBreak += 5
    }
  }
  return out
}

export async function seed(api, { now = Date.now(), log = () => {} } = {}) {
  const today = keyOf(now)
  // The last 9 working days before today: the history every screen reads.
  const days = []
  for (let d = addDays(today, -1); days.length < 9; d = addDays(d, -1)) if (isWorkday(d)) days.push(d)
  const holiday = days[3]
  const asmaSick = days[1]

  await api.call('PATCH', '/api/settings', { batch: { enabled: true, maxRequests: 100, timeout: 30, maxBodySize: 0 } })

  // People and teams. Managers first (teams need them), then the teams, then everyone else.
  const ids = {}
  const make = (p, team) =>
    api.create('users', {
      email: p.email,
      password: p.password ?? PASSWORD,
      passwordConfirm: p.password ?? PASSWORD,
      full_name: p.name,
      role: p.role,
      designation: p.designation,
      team: team ?? '',
      active: !p.inactive,
      joined_on: p.key === 'erum' ? days[4] : '2026-01-01',
      left_on: p.inactive ? days[6] : '',
      must_change_password: p.key === 'newhire',
      tracking_consent_at: p.key === 'newhire' ? '' : new Date(now - 30 * DAY).toISOString()
    })
  for (const p of PEOPLE.filter((x) => x.role !== 'employee')) ids[p.key] = (await make(p)).id
  const teams = {}
  for (const p of PEOPLE.filter((x) => x.manages)) {
    teams[p.manages] = (await api.create('teams', { name: p.manages, manager: ids[p.key] })).id
    await api.update('users', ids[p.key], { team: teams[p.team] })
  }
  for (const p of PEOPLE.filter((x) => x.role === 'employee')) ids[p.key] = (await make(p, teams[p.team])).id
  for (const p of PEOPLE.filter((x) => x.salary)) await api.create('salaries', { user: ids[p.key], monthly_salary_pkr: p.salary })
  log(`people: ${PEOPLE.length}, teams: ${Object.keys(teams).length}`)

  // Calendar: one holiday in the history, a company-wide and a team event this week.
  await api.create('holidays', { date: holiday, name: 'Test Holiday' })
  const tomorrow = addDays(today, 1)
  await api.create('events', { title: 'Company town hall', starts_at: new Date(at(tomorrow, '11:00')).toISOString(), ends_at: new Date(at(tomorrow, '12:00')).toISOString(), description: 'Monthly update for everyone' })
  await api.create('events', { title: 'Alpha sprint review', starts_at: new Date(at(addDays(today, 2), '15:00')).toISOString(), ends_at: new Date(at(addDays(today, 2), '16:00')).toISOString(), team: teams.Alpha })

  // Tracked time: mostly full days, with a late start, an absence and a half day to show every status.
  const segments = []
  for (const [i, d] of days.entries()) {
    if (d === holiday) continue
    const add = (key, start = '09:05', active = 390, idle = 30) => segments.push(...day(ids[key], d, start, active, idle))
    add('admin')
    add('bilal')
    add('sana')
    if (d !== asmaSick) add('asma', i === 0 ? '09:40' : '09:05')
    if (i === 2) {
      // Chand: absent that day
    } else add('chand', '09:05', i === 5 ? 180 : 390)
    add('danish', i === 0 || i === 2 ? '09:35' : '09:05')
    if (i <= 4) add('erum')
    if (i >= 6) add('faisal')
  }
  await api.batchCreate('activity_segments', segments)
  log(`activity segments: ${segments.length} over ${days.length} working days`)

  // Leave in every state, through the real flow (so notifications exist too).
  const tok = {}
  for (const k of ['asma', 'chand', 'danish', 'bilal', 'sana']) tok[k] = await api.tokenOf(PEOPLE.find((p) => p.key === k).email)
  const types = Object.fromEntries((await api.list('leave_types')).map((t) => [t.name, t.id]))
  const apply = (k, type, start, end = start) => api.create('leave_requests', { user: ids[k], leave_type: types[type], start_date: start, end_date: end, reason: 'Seeded test request' }, tok[k])
  const sick = await apply('asma', 'Sick', asmaSick)
  await api.update('leave_requests', sick.id, { status: 'approved', comment: 'Get well soon' }, tok.bilal)
  await apply('chand', 'Casual', nextWorkday(addDays(today, 5)))
  const annual = await apply('danish', 'Annual', nextWorkday(addDays(today, 8)))
  await api.update('leave_requests', annual.id, { status: 'rejected', comment: 'Client deadline that week' }, tok.sana)
  await apply('sana', 'Casual', nextWorkday(addDays(today, 10)))
  log('leave: 1 approved, 2 pending (one is a manager’s, for the admin), 1 rejected')

  // Attendance for the history, counted by the server.
  const adminToken = await api.tokenOf('admin@test.local')
  const recount = await api.call('POST', '/api/attendance/recompute', { from: days[days.length - 1], to: days[0] }, adminToken)
  log(`attendance: ${recount.records} records from ${recount.from} to ${recount.to}`)

  return { today, days, holiday, ids, teams }
}
