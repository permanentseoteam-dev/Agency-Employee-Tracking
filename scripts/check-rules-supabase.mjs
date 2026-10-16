// Verifies the Supabase row-level security and guard triggers against the STAGING project:
// the table checks of scripts/check-rules.mjs (PocketBase), with the same names and the same
// expected allow/deny. Route checks (leave, payroll run, accounts, projects status…) join in
// step 3, once the Edge Functions exist.
// Usage: node scripts/check-rules-supabase.mjs   (reads STAGING_* from .env.supabase; never live)
// It starts by resetting staging to its default rows (refused while npm run test:env is open),
// creates its own throwaway accounts and rows, and deletes them again at the end.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { resetStaging } from './test-env/server.mjs'
import { readState } from './test-env/state.mjs'

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, '..', '.env.supabase'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=("?)(.*?)\2\s*(#.*)?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[3]])
)
const URL = env.STAGING_URL
if (!URL || !env.STAGING_SERVICE_ROLE_KEY) throw new Error('STAGING_URL / STAGING_SERVICE_ROLE_KEY missing in .env.supabase')
const PASS = 'Test-pass-12345'
const RUN = Date.now().toString(36) // keeps emails unique per run
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const root = createClient(URL, env.STAGING_SERVICE_ROLE_KEY, opts)

let failed = 0
let passed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`)
}
/** A query builder or promise resolving to { data, error }; allowed = no error and, for writes, a row came back. */
async function allowed(name, fn) {
  const { data, error } = await fn()
  check(name, !error && !(Array.isArray(data) && data.length === 0), error ? error.message : 'no row changed')
  return data
}
/** Denied = an error, or RLS left nothing to change (PostgREST then returns no rows). */
async function denied(name, fn) {
  const { data, error } = await fn()
  check(name, !!error || (Array.isArray(data) && data.length === 0), 'request was allowed')
}
const must = async (p) => {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

const created = { users: [], teams: [], holidays: [], events: [], runs: [], clients: [] }
async function mkUser(key, role, extra = {}, { banned = false } = {}) {
  const email = `${key}.${RUN}@test.local`
  const { data, error } = await root.auth.admin.createUser({
    email, password: PASS, email_confirm: true, user_metadata: { full_name: key }, ...(banned ? { ban_duration: '876000h' } : {})
  })
  if (error) throw new Error(`createUser ${key}: ${error.message}`)
  created.users.push(data.user.id)
  await must(root.from('profiles').update({ role, active: !banned, ...extra }).eq('id', data.user.id))
  return { id: data.user.id, email }
}
async function as(user) {
  const c = createClient(URL, env.STAGING_ANON_KEY, opts)
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: PASS })
  if (error) throw Object.assign(new Error(error.message), { status: error.status })
  return c
}
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString()
const seg = (user, minute) => ({ user, state: 'active', started_at: at(60 - minute), ended_at: at(55 - minute) })

// A run that was stopped half-way leaves its rows behind (same holiday date, same payroll
// month), and those make the next run fail. Start every run from staging's default rows.
if (readState()) throw new Error('a test environment (npm run test:env) is using staging: stop it first (Ctrl+C or --stop)')
await resetStaging()
console.log('staging reset to its default rows')

try {
  // --- fixtures ---------------------------------------------------------------
  const admin = await mkUser('admin', 'admin')
  const mgrA = await mkUser('mgr.a', 'manager')
  const mgrB = await mkUser('mgr.b', 'manager')
  const teamA = (await must(root.from('teams').insert({ name: `Team A ${RUN}`, manager: mgrA.id }).select()))[0]
  const teamB = (await must(root.from('teams').insert({ name: `Team B ${RUN}`, manager: mgrB.id }).select()))[0]
  created.teams.push(teamA.id, teamB.id)
  await must(root.from('profiles').update({ team: teamA.id }).eq('id', mgrA.id))
  await must(root.from('profiles').update({ team: teamB.id }).eq('id', mgrB.id))
  const empA = await mkUser('emp.a', 'employee', { team: teamA.id })
  const empB = await mkUser('emp.b', 'employee', { team: teamB.id })
  const gone = await mkUser('gone', 'employee', { team: teamA.id, left_on: '2026-09-30' }, { banned: true })
  for (const u of [admin, mgrA, mgrB, empA, empB]) {
    await must(root.from('salaries').insert({ user: u.id, monthly_salary_pkr: 100000 }))
    await must(root.from('presence').insert({ user: u.id, status: 'offline' }))
  }
  const sbAdmin = await as(admin)
  const sbMgrA = await as(mgrA)
  const sbEmpA = await as(empA)

  // --- login ------------------------------------------------------------------
  let goneIn = true
  try {
    await as(gone)
  } catch {
    goneIn = false
  }
  check('inactive user cannot log in', !goneIn)

  // --- seed data ---------------------------------------------------------------
  const settings = await must(sbEmpA.from('org_settings').select('*'))
  check('seed: one org_settings record with 09:00 shift', settings.length === 1 && settings[0].shift_start === '09:00')
  check('seed: 3 leave types', (await must(sbEmpA.from('leave_types').select('*'))).length >= 3)

  // --- salaries & payroll -----------------------------------------------------
  const empSalaries = await must(sbEmpA.from('salaries').select('*'))
  check('employee sees only their own salary', empSalaries.length === 1 && empSalaries[0].user === empA.id, `got ${empSalaries.length}`)
  const mgrSalaries = await must(sbMgrA.from('salaries').select('*'))
  check('manager sees only their own salary', mgrSalaries.length === 1 && mgrSalaries[0].user === mgrA.id, `got ${mgrSalaries.length}`)
  await denied('employee cannot change their own salary', () =>
    sbEmpA.from('salaries').update({ monthly_salary_pkr: 999999 }).eq('id', empSalaries[0]?.id ?? 'missing').select())
  const adminSalaries = await must(sbAdmin.from('salaries').select('*').in('user', [admin.id, mgrA.id, mgrB.id, empA.id, empB.id]))
  check('admin sees all 5 salaries', adminSalaries.length === 5)
  const month = `20${RUN.length % 10}9-0${(RUN.charCodeAt(0) % 9) + 1}` // a month no real run uses
  await denied('employee cannot create a payroll run', () => sbEmpA.from('payroll_runs').insert({ month, status: 'draft' }).select())
  const run = await allowed('admin can create a payroll run', () => sbAdmin.from('payroll_runs').insert({ month, status: 'draft' }).select())
  if (run?.[0]) created.runs.push(run[0].id)
  await denied('a payroll run cannot start finalized', () =>
    sbAdmin.from('payroll_runs').insert({ month: month.replace(/-\d\d$/, '-12'), status: 'finalized' }).select())

  // --- users (profiles) -------------------------------------------------------------
  await allowed('employee can edit own phone', () => sbEmpA.from('profiles').update({ phone: '0300' }).eq('id', empA.id).select())
  await denied('employee cannot make self admin', () => sbEmpA.from('profiles').update({ role: 'admin' }).eq('id', empA.id).select())
  await denied('employee cannot change own team', () => sbEmpA.from('profiles').update({ team: teamB.id }).eq('id', empA.id).select())
  await denied('employee cannot edit someone else', () => sbEmpA.from('profiles').update({ phone: '1' }).eq('id', empB.id).select())
  await denied('employee cannot create users', () => sbEmpA.from('profiles').insert({ id: crypto.randomUUID(), role: 'admin' }).select())
  await allowed('admin can change a role', () => sbAdmin.from('profiles').update({ designation: 'Dev' }).eq('id', empB.id).select())
  check('employee cannot see other emails', (await must(sbEmpA.from('profile_emails').select('*').eq('id', empB.id))).length === 0)
  check('admin can see emails', (await must(sbAdmin.from('profile_emails').select('*').eq('id', empB.id)))[0]?.email === empB.email)

  // --- activity segments --------------------------------------------------------
  const segId = `seg${RUN}`.slice(0, 15).padEnd(15, 'a')
  const own = await allowed('employee can create own segment with client id', () =>
    sbEmpA.from('activity_segments').insert({ id: segId, ...seg(empA.id, 0) }).select())
  await denied('duplicate segment id is rejected', () => sbEmpA.from('activity_segments').insert({ id: segId, ...seg(empA.id, 0) }).select())
  await denied('employee cannot create a segment for someone else', () =>
    sbEmpA.from('activity_segments').insert({ id: `${segId.slice(0, 14)}b`, ...seg(empB.id, 10) }).select())
  await denied('employee cannot edit own segment', () => sbEmpA.from('activity_segments').update({ state: 'idle' }).eq('id', own?.[0]?.id ?? 'x').select())
  await denied('employee cannot delete own segment', () => sbEmpA.from('activity_segments').delete().eq('id', own?.[0]?.id ?? 'x').select())
  await denied('overlapping segment is rejected', () =>
    sbEmpA.from('activity_segments').insert({ id: `${segId.slice(0, 14)}c`, ...seg(empA.id, 2) }).select())
  await denied('segment from a clock set 1 hour ahead is rejected', () =>
    sbEmpA.from('activity_segments').insert({ id: `${segId.slice(0, 14)}d`, ...seg(empA.id, 120) }).select())
  await must(root.from('activity_segments').insert({ id: `${segId.slice(0, 14)}e`, ...seg(empB.id, 20) }))
  const ids = [empA.id, empB.id]
  check('employee sees only own segments', (await must(sbEmpA.from('activity_segments').select('id').in('user', ids))).length === 1)
  check('manager A sees team A segments only', (await must(sbMgrA.from('activity_segments').select('id').in('user', ids))).length === 1)
  check('admin sees all segments', (await must(sbAdmin.from('activity_segments').select('id').in('user', ids))).length === 2)

  // --- presence (Live Board) ----------------------------------------------------
  const five = [admin.id, mgrA.id, mgrB.id, empA.id, empB.id]
  const mgrBoard = await must(sbMgrA.from('presence').select('*').in('user', five))
  check('manager A board shows self + emp A only', mgrBoard.length === 2 && !mgrBoard.some((p) => p.user === empB.id))
  check('admin board shows everyone', (await must(sbAdmin.from('presence').select('*').in('user', five))).length === 5)
  await allowed('employee can update own presence', () =>
    sbEmpA.from('presence').update({ status: 'active', today_active_s: 60 }).eq('user', empA.id).select())
  await denied('employee cannot move presence to another user', () =>
    sbEmpA.from('presence').update({ user: empB.id }).eq('user', empA.id).select())

  // --- attendance & notifications are function-only ---------------------------------
  await denied('employee cannot write attendance', () =>
    sbEmpA.from('attendance').insert({ user: empA.id, date: '2026-10-14', status: 'present' }).select())
  await denied('admin cannot write attendance directly either', () =>
    sbAdmin.from('attendance').insert({ user: empA.id, date: '2026-10-14', status: 'present' }).select())
  await denied('users cannot create notifications', () => sbEmpA.from('notifications').insert({ user: empA.id, type: 'x' }).select())
  const note = (await must(root.from('notifications').insert({ user: empA.id, type: 'leave_decided', payload: { status: 'approved' } }).select()))[0]
  await allowed('owner can mark a notification read', () =>
    sbEmpA.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', note.id).select())
  await denied('owner cannot rewrite a notification', () =>
    sbEmpA.from('notifications').update({ payload: { status: 'rejected' } }).eq('id', note.id).select())
  await denied('owner cannot hand a notification to someone else', () =>
    sbEmpA.from('notifications').update({ user: empB.id }).eq('id', note.id).select())

  // --- leave is function-only; reading is own or staff -----------------------------
  const types = await must(sbEmpA.from('leave_types').select('*'))
  const sick = types.find((t) => t.name === 'Sick')
  await denied('employee cannot write leave requests directly', () =>
    sbEmpA.from('leave_requests').insert({ user: empA.id, leave_type: sick.id, start_date: '2026-11-02', end_date: '2026-11-02', days: 1 }).select())
  await must(root.from('leave_requests').insert({ user: empA.id, leave_type: sick.id, start_date: '2026-11-02', end_date: '2026-11-02', days: 1, status: 'approved' }))
  await must(root.from('leave_requests').insert({ user: empB.id, leave_type: sick.id, start_date: '2026-11-03', end_date: '2026-11-03', days: 1 }))
  check('employee sees only own leave', (await must(sbEmpA.from('leave_requests').select('user').in('user', ids))).length === 1)
  check('manager A sees team A leave only', (await must(sbMgrA.from('leave_requests').select('user').in('user', ids))).every((r) => r.user === empA.id))
  const myBal = await must(sbEmpA.from('leave_balances').select('*'))
  check('employee sees only own balances', myBal.length >= 3 && myBal.every((b) => b.user === empA.id), `got ${myBal.length}`)
  const mgrBal = await must(sbMgrA.from('leave_balances').select('user'))
  check('manager A sees own + team A balances (inactive excluded)', mgrBal.every((b) => [mgrA.id, empA.id].includes(b.user)) && mgrBal.length > 0)

  // --- shared data -------------------------------------------------------------
  await denied('employee cannot change org settings', () =>
    sbEmpA.from('org_settings').update({ grace_minutes: 60 }).eq('id', settings[0].id).select())
  await allowed('admin can change org settings', () => sbAdmin.from('org_settings').update({ grace_minutes: 15 }).eq('id', settings[0].id).select())
  const hDate = `2099-12-${String((RUN.charCodeAt(1) % 28) + 1).padStart(2, '0')}`
  await denied('employee cannot add holidays', () => sbEmpA.from('holidays').insert({ date: hDate, name: 'Quaid Day' }).select())
  const hol = await allowed('admin can add holidays', () => sbAdmin.from('holidays').insert({ date: hDate, name: 'Quaid Day' }).select())
  if (hol?.[0]) created.holidays.push(hol[0].id)
  await denied('bad date format is rejected', () => sbAdmin.from('holidays').insert({ date: '25-12-2026', name: 'x' }).select())

  // --- calendar events (admins write; everyone reads; ends after start) ---
  const event = { title: `Town hall ${RUN}`, starts_at: '2099-10-16T10:00:00Z', ends_at: '2099-10-16T11:00:00Z' }
  await denied('employee cannot add events', () => sbEmpA.from('events').insert(event).select())
  await denied('manager cannot add events', () => sbMgrA.from('events').insert(event).select())
  const townHall = await allowed('admin can add a company-wide event', () => sbAdmin.from('events').insert(event).select())
  const teamEv = await allowed('admin can add a team event', () => sbAdmin.from('events').insert({ ...event, title: `Team A sync ${RUN}`, team: teamA.id }).select())
  created.events.push(townHall?.[0]?.id, teamEv?.[0]?.id)
  check('everyone can read events', (await must(sbEmpA.from('events').select('id').in('id', created.events.filter(Boolean)))).length === 2)
  await denied('an event cannot end before it starts', () => sbAdmin.from('events').insert({ ...event, ends_at: '2099-10-16T09:00:00Z' }).select())
  await denied('an event cannot be moved to end before it starts', () =>
    sbAdmin.from('events').update({ ends_at: '2099-10-16T10:00:00Z' }).eq('id', townHall?.[0]?.id ?? 'x').select())

  // --- stars: everyone reads the rules, admins write; automatic rules stay ------------------
  const rules = await must(sbEmpA.from('star_rules').select('*'))
  check('everyone reads the star rules (3 automatic)', rules.filter((r) => r.auto).length === 3)
  await denied('employee cannot add a star rule', () => sbEmpA.from('star_rules').insert({ name: `Phone ${RUN}`, stars: 1 }).select())
  const phone = await allowed('admin adds a rule given by hand', () => sbAdmin.from('star_rules').insert({ name: `Phone ${RUN}`, stars: 2 }).select())
  await denied('admin cannot add another automatic rule', () => sbAdmin.from('star_rules').insert({ name: `Auto ${RUN}`, auto: 'late' }).select())
  const late = rules.find((r) => r.auto === 'late')
  await denied('an automatic rule cannot become manual', () => sbAdmin.from('star_rules').update({ auto: '' }).eq('id', late.id).select())
  await denied('an automatic rule cannot be deleted', () => sbAdmin.from('star_rules').delete().eq('id', late.id).select())
  await allowed('admin deletes a rule given by hand', () => sbAdmin.from('star_rules').delete().eq('id', phone?.[0]?.id ?? 'x').select())

  // --- projects: clients and their calendars ------------------------------------------------
  const acme = (await must(sbAdmin.from('clients').insert({ name: `Acme ${RUN}`, description: 'Retainer', members: [empA.id, mgrA.id] }).select()))[0]
  const north = (await must(root.from('clients').insert({ name: `North ${RUN}`, members: [empB.id] }).select()))[0]
  created.clients.push(acme.id, north.id)
  const empClients = await must(sbEmpA.from('clients').select('id').in('id', [acme.id, north.id]))
  check('a member sees only their own clients', empClients.length === 1 && empClients[0].id === acme.id, `got ${empClients.length}`)
  const sbMgrB = await as(mgrB)
  check('someone on no client sees none', (await must(sbMgrB.from('clients').select('id').in('id', [acme.id, north.id]))).length === 0)
  check('the admin sees every client', (await must(sbAdmin.from('clients').select('id').in('id', [acme.id, north.id]))).length === 2)
  await denied('an employee cannot create a client', () => sbEmpA.from('clients').insert({ name: `Mine ${RUN}` }).select())
  await denied('a manager cannot add people to a client', () => sbMgrA.from('clients').update({ members: [empA.id, mgrA.id, mgrB.id] }).eq('id', acme.id).select())
  await denied('a member cannot rename their client', () => sbEmpA.from('clients').update({ name: 'Renamed' }).eq('id', acme.id).select())
  await denied('client names are unique', () => sbAdmin.from('clients').insert({ name: `acme ${RUN}` }).select())
  const nov = (h) => `2099-11-03T${String(h).padStart(2, '0')}:00:00Z`
  const meeting = await allowed('an employee on the client adds a meeting to its calendar', () =>
    sbEmpA.from('project_events').insert({ client: acme.id, title: 'Kickoff', starts_at: nov(5), ends_at: nov(6), created_by: admin.id }).select())
  const mid = meeting?.[0]?.id ?? 'x'
  check('the server records who added it', meeting?.[0]?.created_by === empA.id)
  await allowed('a manager on the client changes it', () => sbMgrA.from('project_events').update({ title: 'Kickoff call' }).eq('id', mid).select())
  await denied('an event cannot end before it starts', () => sbEmpA.from('project_events').update({ ends_at: nov(4) }).eq('id', mid).select())
  await denied('an event cannot move to another client', () => sbAdmin.from('project_events').update({ client: north.id }).eq('id', mid).select())
  const sbEmpB = await as(empB)
  await denied('someone not on the client cannot add to its calendar', () =>
    sbEmpB.from('project_events').insert({ client: acme.id, title: 'Sneaky', starts_at: nov(7), ends_at: nov(8) }).select())
  check('someone not on the client cannot see its calendar', (await must(sbEmpB.from('project_events').select('id').eq('client', acme.id))).length === 0)
  await denied('someone not on the client cannot delete its events', () => sbEmpB.from('project_events').delete().eq('id', mid).select())
  await allowed('the admin archives a client', () => sbAdmin.from('clients').update({ archived: true }).eq('id', acme.id).select())
  check('an archived client disappears for its people', (await must(sbEmpA.from('clients').select('id').eq('id', acme.id))).length === 0)
  check('and so does its calendar', (await must(sbEmpA.from('project_events').select('id').eq('client', acme.id))).length === 0)
  await allowed('the admin deletes a client', () => sbAdmin.from('clients').delete().eq('id', acme.id).select())
  check('its calendar goes with it', (await must(root.from('project_events').select('id').eq('client', acme.id))).length === 0)

  // --- functions, step 3a: attendance, reports, project status ------------------------------
  const fn = async (client, name, payload) => {
    const { data, error } = await client.functions.invoke(name, { body: payload })
    return { data, error: error ? Object.assign(error, { message: (await error.context?.json?.().catch(() => null))?.message ?? error.message }) : null }
  }
  // A finished weekday (Karachi), and a worked morning on it for emp A.
  const day = (() => {
    let d = new Date(Date.now() + 5 * 3600000 - 86400000)
    while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() - 86400000)
    return d.toISOString().slice(0, 10)
  })()
  const karachi = (hhmm) => new Date(Date.parse(`${day}T${hhmm}:00Z`) - 5 * 3600000).toISOString()
  await must(root.from('activity_segments').insert({ id: `${segId.slice(0, 13)}w1`, user: empA.id, state: 'active', started_at: karachi('09:05'), ended_at: karachi('13:30') }))
  await denied('employee cannot recompute attendance', () => fn(sbEmpA, 'attendance-recompute', { date: day }))
  await denied('manager cannot recompute attendance', () => fn(sbMgrA, 'attendance-recompute', { date: day }))
  await allowed('admin recomputes a finished day', () => fn(sbAdmin, 'attendance-recompute', { date: day }))
  const [rec] = await must(sbEmpA.from('attendance').select('status, active_s').eq('date', day).eq('user', empA.id))
  check('the day counts as Present (started 09:05, 4h25m active)', rec?.status === 'present' && rec?.active_s === 4 * 3600 + 25 * 60, JSON.stringify(rec))
  await denied('attendance cannot be recomputed for today', () => fn(sbAdmin, 'attendance-recompute', { date: new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10) }))
  await allowed('the hourly job runs with the service role', () => fn(root, 'attendance-recompute', { nightly: true }))

  await denied('employees cannot open reports', () => fn(sbEmpA, 'reports-activity', { from: day, to: day }))
  const rep = await fn(sbMgrA, 'reports-activity', { from: day, to: day, group: 'day' })
  check('a manager’s report covers only their teams', !rep.error && rep.data.rows.length === 1 && rep.data.rows[0].user === empA.id && rep.data.rows[0].active_s === 4 * 3600 + 25 * 60, JSON.stringify(rep.data ?? rep.error?.message))
  const adminRep = await fn(sbAdmin, 'reports-activity', { from: day, to: day, group: 'month', user: empA.id })
  check('the admin reports by month for one person', !adminRep.error && adminRep.data.rows[0]?.period === day.slice(0, 7))

  const beta = (await must(sbAdmin.from('clients').insert({ name: `Beta ${RUN}`, members: [empA.id, mgrA.id] }).select()))[0]
  created.clients.push(beta.id)
  const team = await fn(sbEmpA, 'projects-status', { client: beta.id, date: day })
  check('a member reads their client’s team status', !team.error && team.data.members.length === 2, JSON.stringify(team.data ?? team.error?.message))
  check('status only: no hours or times', !!team.data?.members?.every((m) => Object.keys(m).sort().join() === 'month,status,user'))
  check('a past day shows the counted status', team.data?.members?.find((m) => m.user === empA.id)?.status === 'present')
  await denied('someone not on the client cannot read its status', () => fn(sbEmpB, 'projects-status', { client: beta.id }))
  await denied('no status for a day that hasn’t come yet', () => fn(sbEmpA, 'projects-status', { client: beta.id, date: '2099-01-01' }))
  const lv = await fn(sbEmpA, 'projects-leaves', { client: beta.id, from: '2026-11-01', to: '2026-11-30' })
  check('a member reads their client’s approved leave, without type or reason', !lv.error && lv.data.some((r) => r.user === empA.id) && lv.data.every((r) => !('reason' in r) && !('leave_type' in r)), JSON.stringify(lv.data ?? lv.error?.message))
  await denied('someone not on the client cannot read its leave', () => fn(sbEmpB, 'projects-leaves', { client: beta.id, from: '2026-11-01', to: '2026-11-30' }))

  // --- functions, step 3b: leave requests, decisions and notifications ----------------------
  const casual = types.find((t) => t.name === 'Casual')
  const apply = (client, extra) => fn(client, 'leave-request', { leave_type: casual.id, ...extra })
  const decide = (client, id, status, extra = {}) => fn(client, 'leave-update', { id, status, ...extra })
  // A Monday in 2098 (no other leave that year), and the dates around it.
  const mon = (() => { let d = new Date(Date.UTC(2098, 2, 1)); while (d.getUTCDay() !== 1) d = new Date(d.getTime() + 86400000); return d })()
  const D = (n) => new Date(mon.getTime() + n * 86400000).toISOString().slice(0, 10)
  const first = await apply(sbEmpA, { start_date: D(14), end_date: D(14), reason: 'e2e' })
  check('employee can apply for leave', !first.error && first.data?.status === 'pending', first.error?.message)
  const hol2 = (await must(root.from('holidays').insert({ date: D(2), name: `Test Holiday ${RUN}` }).select()))[0]
  created.holidays.push(hol2.id)
  const week = await apply(sbEmpA, { start_date: D(0), end_date: D(4) })
  check('employee applies Mon–Fri with a holiday inside', !week.error, week.error?.message)
  check('the server counts the days (5 working days − 1 holiday = 4)', Number(week.data?.days) === 4, JSON.stringify(week.data?.days))
  const half = await apply(sbEmpA, { start_date: D(7), end_date: D(7), half_day: true })
  check('a half day counts 0.5', Number(half.data?.days) === 0.5, half.error?.message)
  await denied('a half day over two days is refused', () => apply(sbEmpA, { start_date: D(8), end_date: D(9), half_day: true }))
  await denied('a weekend-only request is refused (no working days)', () => apply(sbEmpA, { start_date: D(5), end_date: D(6) }))
  await denied('an end before the start is refused', () => apply(sbEmpA, { start_date: D(9), end_date: D(8) }))
  await denied('a request across the new year is refused', () => apply(sbEmpA, { start_date: '2098-12-31', end_date: '2099-01-01' }))
  await denied('a request overlapping your own pending leave is refused', () => apply(sbEmpA, { start_date: D(3), end_date: D(3) }))
  await denied('paid leave past the yearly quota is refused (5.5 pending + 10 > 10)', () => apply(sbEmpA, { start_date: D(21), end_date: D(32) }))
  const unpaid = (await must(root.from('leave_types').insert({ name: `Unpaid ${RUN}`, yearly_quota_days: 0, paid: false }).select()))[0]
  await allowed('unpaid leave has no quota', () => fn(sbEmpA, 'leave-request', { leave_type: unpaid.id, start_date: D(21), end_date: D(32) }))
  await must(root.from('profiles').update({ joined_on: D(60) }).eq('id', empB.id))
  await denied('leave before the joining date is refused', () => apply(sbEmpB, { start_date: D(57), end_date: D(57) }))
  await must(root.from('profiles').update({ joined_on: '' }).eq('id', empB.id))
  const sneaky = await apply(sbEmpA, { start_date: D(35), end_date: D(35), status: 'approved' })
  check('employee cannot apply as approved', !sneaky.error && sneaky.data?.status === 'pending', sneaky.error?.message)

  await denied('employee cannot approve own leave', () => decide(sbEmpA, first.data.id, 'approved'))
  await denied('the employee cannot change the comment while cancelling', () => decide(sbEmpA, first.data.id, 'cancelled', { comment: 'no' }))
  await denied('a manager cannot cancel a pending request (the employee does)', () => decide(sbMgrA, week.data.id, 'cancelled'))
  const reqB = await apply(sbEmpB, { start_date: D(14), end_date: D(14) })
  await denied('manager A cannot approve team B leave', () => decide(sbMgrA, reqB.data.id, 'approved'))
  const ok = await decide(sbMgrA, week.data.id, 'approved', { comment: 'Enjoy' })
  check('manager A approves with a comment', !ok.error && ok.data?.status === 'approved', ok.error?.message)
  check('the server sets the approver and decision time', ok.data?.approver === mgrA.id && !!ok.data?.decided_at)
  await denied('a manager cannot reverse a decision', () => decide(sbMgrA, week.data.id, 'rejected'))
  await denied('the employee cannot cancel approved leave', () => decide(sbEmpA, week.data.id, 'cancelled'))
  await allowed('admin reverses: approved → rejected', () => decide(sbAdmin, week.data.id, 'rejected', { comment: 'Busy week' }))
  await denied('a manager cannot rewrite the comment on an admin’s decision', () => decide(sbMgrA, week.data.id, 'rejected', { comment: 'Overruled' }))
  await allowed('admin reverses: rejected → approved', () => decide(sbAdmin, week.data.id, 'approved'))
  await allowed('admin cancels approved leave', () => decide(sbAdmin, week.data.id, 'cancelled'))
  check('the admin is now the approver', (await must(root.from('leave_requests').select('approver').eq('id', week.data.id)))[0]?.approver === admin.id)
  await denied('a cancelled request cannot be reopened', () => decide(sbAdmin, week.data.id, 'approved'))
  const ownCancel = await decide(sbEmpA, half.data.id, 'cancelled')
  check('employee can cancel own pending leave', !ownCancel.error && ownCancel.data?.status === 'cancelled', ownCancel.error?.message)
  check('an employee’s own cancel is not stamped as a decision', !ownCancel.data?.approver && !ownCancel.data?.decided_at)

  const mgrReq = await apply(sbMgrA, { start_date: D(15), end_date: D(15) })
  await denied('manager cannot approve own leave', () => decide(sbMgrA, mgrReq.data.id, 'approved'))
  await allowed('admin approves the manager leave', () => decide(sbAdmin, mgrReq.data.id, 'approved'))
  const notesOf = async (client) => must(client.from('notifications').select('type, payload'))
  const mgrNotes = await notesOf(sbMgrA)
  const adminNotes = await notesOf(sbAdmin)
  check('manager A is notified of a team A request', mgrNotes.some((n) => n.type === 'leave_requested' && n.payload.request === first.data.id))
  check('a manager’s own request goes to the admins, not to themselves',
    adminNotes.some((n) => n.type === 'leave_requested' && n.payload.request === mgrReq.data.id) && !mgrNotes.some((n) => n.type === 'leave_requested' && n.payload.request === mgrReq.data.id))
  check('the manager hears the admin’s decision on their own request', mgrNotes.some((n) => n.type === 'leave_decided' && n.payload.request === mgrReq.data.id))
  check('employee is notified of the decision', (await notesOf(sbEmpA)).some((n) => n.type === 'leave_decided' && n.payload.request === week.data.id))
  check('cancelling notifies nobody', !(await notesOf(sbEmpA)).some((n) => n.payload?.request === half.data.id))
  const adminReq = await apply(sbAdmin, { start_date: D(16), end_date: D(16) })
  await denied('a manager cannot decide the admin’s own leave', () => decide(sbMgrA, adminReq.data.id, 'approved'))
  await allowed('the admin cancels their own pending request', () => decide(sbAdmin, adminReq.data.id, 'cancelled'))

  const past = await apply(sbEmpA, { leave_type: sick.id, start_date: day, end_date: day })
  await allowed('approving past leave', () => decide(sbMgrA, past.data?.id, 'approved'))
  check('approving past leave marks that day On leave', (await must(root.from('attendance').select('status').eq('user', empA.id).eq('date', day)))[0]?.status === 'on_leave')
  await allowed('rejecting it again', () => decide(sbAdmin, past.data?.id, 'rejected'))
  check('rejecting it again counts the day from its activity (Present)', (await must(root.from('attendance').select('status').eq('user', empA.id).eq('date', day)))[0]?.status === 'present')
  await root.from('leave_requests').delete().eq('leave_type', unpaid.id)
  await root.from('leave_types').delete().eq('id', unpaid.id)

  // --- functions, step 3c: payroll run and the finalized lock ----------------------------------
  const thisMonth = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 7)
  const runPay = (client, m = thisMonth) => fn(client, 'payroll-run', { month: m })
  await denied('employee cannot run payroll', () => runPay(sbEmpA))
  await denied('manager cannot run payroll', () => runPay(sbMgrA))
  await denied('payroll cannot be run for a future month', () => runPay(sbAdmin, '2099-01'))
  const pay = await runPay(sbAdmin)
  check('admin runs payroll', !pay.error, pay.error?.message)
  created.runs.push(pay.data?.run)
  const lines = await must(sbAdmin.from('payroll_items').select('*').eq('run', pay.data?.run ?? 'x').in('user', five))
  check('one line per employee with a salary (not someone who left before the month)', lines.length === 5, `got ${lines.length}`)
  check('an employee sees no draft payroll (run or line)',
    (await must(sbEmpA.from('payroll_items').select('id').eq('run', pay.data?.run ?? 'x'))).length === 0 && (await must(sbEmpA.from('payroll_runs').select('id').eq('id', pay.data?.run ?? 'x'))).length === 0)
  const lineA = lines.find((l) => l.user === empA.id)
  await denied('an employee cannot edit their own payroll line', () => sbEmpA.from('payroll_items').update({ adjustment_pkr: 99999 }).eq('id', lineA.id).select())
  await allowed('admin sets an adjustment and note on a draft line', () => sbAdmin.from('payroll_items').update({ adjustment_pkr: -5000, note: 'Advance' }).eq('id', lineA.id).select())
  const adjusted = (await must(sbAdmin.from('payroll_items').select('*').eq('id', lineA.id)))[0]
  check('net follows the adjustment', Number(adjusted.net) === Number(adjusted.base) - Number(adjusted.deductions) - 5000, JSON.stringify(adjusted))
  await denied('the counted figures cannot be edited', () => sbAdmin.from('payroll_items').update({ deductions: 0 }).eq('id', lineA.id).select())
  await runPay(sbAdmin)
  const recounted = (await must(sbAdmin.from('payroll_items').select('*').eq('run', pay.data?.run ?? 'x').eq('user', empA.id)))[0]
  check('recounting a draft keeps adjustments and notes', Number(recounted?.adjustment_pkr) === -5000 && recounted?.note === 'Advance')
  await allowed('admin finalizes the run', () => sbAdmin.from('payroll_runs').update({ status: 'finalized' }).eq('id', pay.data?.run ?? 'x').select())
  const empLines = await must(sbEmpA.from('payroll_items').select('user, run, payroll_runs(status)').eq('run', pay.data?.run ?? 'x'))
  check('once finalized, the employee sees only their own line and its month',
    empLines.length === 1 && empLines[0].user === empA.id && empLines[0].payroll_runs?.status === 'finalized', JSON.stringify(empLines))
  const mgrLines = await must(sbMgrA.from('payroll_items').select('user').eq('run', pay.data?.run ?? 'x'))
  check('the manager sees only their own line, not their team’s', mgrLines.length === 1 && mgrLines[0].user === mgrA.id, `got ${mgrLines.length}`)
  await denied('a finalized run cannot be reopened', () => sbAdmin.from('payroll_runs').update({ status: 'draft' }).eq('id', pay.data?.run ?? 'x').select())
  await denied('a finalized run cannot be deleted', () => sbAdmin.from('payroll_runs').delete().eq('id', pay.data?.run ?? 'x').select())
  await denied('a finalized line cannot be edited', () => sbAdmin.from('payroll_items').update({ adjustment_pkr: 0 }).eq('id', recounted.id).select())
  await denied('a finalized line cannot be deleted', () => sbAdmin.from('payroll_items').delete().eq('id', recounted.id).select())
  await denied('lines cannot be added to a finalized run', () => sbAdmin.from('payroll_items').insert({ run: pay.data?.run, user: mgrB.id, base: 1 }).select())
  await denied('a finalized month cannot be recounted', () => runPay(sbAdmin))
  await denied('not even the service role can edit a finalized line', () => root.from('payroll_items').update({ adjustment_pkr: 1 }).eq('id', recounted.id).select())

  // --- functions, step 3d: accounts, sign-ups, stars, switch role --------------------------------
  const orgFn = (client, action, extra) => fn(client, 'org', { action, ...extra })
  const salaryOf = async (client) => (await client.from('salaries').select('user')).data ?? []
  const hire = { email: `newhire.${RUN}@test.local`, full_name: 'New Hire', password: 'Temp-pass-1', team: teamA.id, role: 'employee', monthly_salary_pkr: 50000 }
  await denied('employee cannot add employees', () => orgFn(sbEmpA, 'invite', hire))
  await denied('manager cannot add employees', () => orgFn(sbMgrA, 'invite', hire))
  const invited = await orgFn(sbAdmin, 'invite', hire)
  check('admin adds an employee', !invited.error && !!invited.data?.id, invited.error?.message)
  if (invited.data?.id) created.users.push(invited.data.id)
  await denied('duplicate email is rejected', () => orgFn(sbAdmin, 'invite', hire))
  await denied('short temporary password is rejected', () => orgFn(sbAdmin, 'invite', { ...hire, email: `short.${RUN}@test.local`, password: 'abc' }))
  check('invite also creates the salary record', (await must(sbAdmin.from('salaries').select('monthly_salary_pkr').eq('user', invited.data?.id ?? 'x')))[0]?.monthly_salary_pkr === 50000)
  const noPay = await orgFn(sbAdmin, 'invite', { ...hire, email: `nopay.${RUN}@test.local`, monthly_salary_pkr: undefined })
  check('an employee can be added before their salary is known', !noPay.error, noPay.error?.message)
  if (noPay.data?.id) created.users.push(noPay.data.id)
  check('their salary is stored as 0 (not set)', (await must(sbAdmin.from('salaries').select('monthly_salary_pkr').eq('user', noPay.data?.id ?? 'x')))[0]?.monthly_salary_pkr === 0)
  const hireUser = { id: invited.data?.id, email: hire.email }
  const signIn = async (email, password) => {
    const c = createClient(URL, env.STAGING_ANON_KEY, opts)
    const { error } = await c.auth.signInWithPassword({ email, password })
    return { client: error ? null : c, error }
  }
  const h1 = await signIn(hire.email, hire.password)
  check('new hire signs in with the temporary password', !!h1.client, h1.error?.message)
  const hireProfile = h1.client ? (await must(h1.client.from('profiles').select('*').eq('id', hireUser.id)))[0] : null
  check('new hire must change the password', hireProfile?.must_change_password === true)
  check('new hire is in team A', hireProfile?.team === teamA.id)

  await denied('employee cannot reset passwords', () => orgFn(sbEmpA, 'reset-password', { userId: hireUser.id, password: 'Temp-pass-2' }))
  await allowed('admin resets a password', () => orgFn(sbAdmin, 'reset-password', { userId: hireUser.id, password: 'Temp-pass-2' }))
  check('reset signs out the old session', h1.client ? (await salaryOf(h1.client)).length === 0 : false)
  check('new temporary password works', !!(await signIn(hire.email, 'Temp-pass-2')).client)

  await denied('manager cannot deactivate people', () => orgFn(sbMgrA, 'set-active', { userId: hireUser.id, active: false }))
  await denied('admin cannot deactivate themselves', () => orgFn(sbAdmin, 'set-active', { userId: admin.id, active: false }))
  const h2 = await signIn(hire.email, 'Temp-pass-2')
  await allowed('admin deactivates an employee', () => orgFn(sbAdmin, 'set-active', { userId: hireUser.id, active: false, left_on: '2026-10-31' }))
  check('deactivation signs them out immediately', h2.client ? (await salaryOf(h2.client)).length === 0 : false)
  check('deactivated employee cannot log in', !(await signIn(hire.email, 'Temp-pass-2')).client)
  check('leaving date is recorded', (await must(sbAdmin.from('profiles').select('left_on').eq('id', hireUser.id)))[0]?.left_on === '2026-10-31')
  await allowed('admin reactivates the employee', () => orgFn(sbAdmin, 'set-active', { userId: hireUser.id, active: true }))
  check('reactivated employee can log in', !!(await signIn(hire.email, 'Temp-pass-2')).client)

  // "Create an account": open to guests
  const guest = createClient(URL, env.STAGING_ANON_KEY, opts)
  const reg = (extra) => fn(guest, 'register', extra)
  const signup = { email: `Signup.${RUN}@Test.Local`, full_name: 'Sign Up', password: 'Own-pass-123', phone: '0300 1234567', role: 'admin', team: teamA.id, active: true }
  const r1 = await reg(signup)
  check('a guest registers', !r1.error && !!r1.data?.id, r1.error?.message)
  if (r1.data?.id) created.users.push(r1.data.id)
  const sp = (await must(root.from('profiles').select('*').eq('id', r1.data?.id ?? 'x')))[0]
  check('a sign-up waits for approval: switched off, employee, no team, whatever the request said', sp && !sp.active && sp.pending_approval && sp.role === 'employee' && !sp.team, JSON.stringify(sp))
  const se = (await must(root.from('profile_emails').select('email').eq('id', r1.data?.id ?? 'x')))[0]
  check('sign-up: email lowercased, phone kept, no forced password change', se?.email === signup.email.toLowerCase() && sp?.phone === '0300 1234567' && sp?.must_change_password === false)
  check('sign-up creates the salary record as 0 (not set)', (await must(root.from('salaries').select('monthly_salary_pkr').eq('user', r1.data?.id ?? 'x')))[0]?.monthly_salary_pkr === 0)
  await denied('registering an existing email is refused', () => reg(signup))
  await denied('registering with a short password is refused', () => reg({ ...signup, email: `s2.${RUN}@test.local`, password: 'abc' }))
  await denied('registering without a name is refused', () => reg({ ...signup, email: `s3.${RUN}@test.local`, full_name: '' }))
  const r2 = await reg({ ...signup, email: `second.${RUN}@test.local` })
  check('a second person registers', !r2.error, r2.error?.message)
  if (r2.data?.id) created.users.push(r2.data.id)
  const r6 = await reg({ ...signup, email: `sixth.${RUN}@test.local` })
  check('a 6th sign-up within a minute is refused (rate limit)', !!r6.error && r6.error.context?.status === 429, r6.error?.message ?? 'allowed')
  if (r6.data?.id) created.users.push(r6.data.id)
  check('a sign-up waiting for approval cannot sign in', !(await signIn(signup.email.toLowerCase(), signup.password)).client)
  check('every active admin is told a sign-up is waiting', (await must(sbAdmin.from('notifications').select('type, payload'))).some((n) => n.type === 'signup_pending' && n.payload.user === r1.data?.id))
  await denied('an employee cannot approve sign-ups', () => orgFn(sbEmpA, 'approve', { userId: r1.data?.id }))
  await denied('a manager cannot approve sign-ups', () => orgFn(sbMgrA, 'approve', { userId: r1.data?.id }))
  await denied('"Reactivate" cannot switch on a waiting sign-up', () => orgFn(sbAdmin, 'set-active', { userId: r1.data?.id, active: true }))
  await allowed('an admin approves a sign-up', () => orgFn(sbAdmin, 'approve', { userId: r1.data?.id }))
  const ap = (await must(root.from('profiles').select('*').eq('id', r1.data?.id ?? 'x')))[0]
  check('approved: active, no longer waiting, joined today', ap?.active && !ap?.pending_approval && ap?.joined_on === new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10), JSON.stringify(ap))
  const approvedIn = await signIn(signup.email.toLowerCase(), signup.password)
  check('an approved person signs in', !!approvedIn.client, approvedIn.error?.message)
  if (approvedIn.client) {
    await denied('they cannot make themselves admin', () => approvedIn.client.from('profiles').update({ role: 'admin' }).eq('id', r1.data.id).select())
    await denied('they cannot mark themselves as waiting again', () => approvedIn.client.from('profiles').update({ pending_approval: true }).eq('id', r1.data.id).select())
  }
  await denied('approving twice is refused', () => orgFn(sbAdmin, 'approve', { userId: r1.data?.id }))
  await denied('an approved account cannot be "rejected"', () => orgFn(sbAdmin, 'reject', { userId: r1.data?.id }))
  await denied('an employee cannot reject sign-ups', () => orgFn(sbEmpA, 'reject', { userId: r2.data?.id }))
  await allowed('an admin rejects a sign-up', () => orgFn(sbAdmin, 'reject', { userId: r2.data?.id }))
  check('a rejected sign-up is deleted, with its salary record',
    (await must(root.from('profiles').select('id').eq('id', r2.data?.id ?? 'x'))).length === 0 && (await must(root.from('salaries').select('id').eq('user', r2.data?.id ?? 'x'))).length === 0)

  // stars
  check('the late penalty is gone from the rules', !('late_penalty_pkr' in settings[0]))
  check('monthly leave limits start at 0 (no limit)', settings[0].monthly_full_leaves === 0 && settings[0].monthly_half_leaves === 0)
  check('payroll lines have no late count any more', !('late_count' in (lines[0] ?? {})))
  await denied('an employee cannot change star amounts', () => sbEmpA.from('star_rules').update({ stars: 5 }).eq('id', late.id).select())
  await denied('a manager cannot change star amounts', () => sbMgrA.from('star_rules').update({ stars: 5 }).eq('id', late.id).select())
  await allowed('an admin sets the stars for a rule break', () => sbAdmin.from('star_rules').update({ stars: 2 }).eq('id', late.id).select())
  const byHand = (await must(sbAdmin.from('star_rules').insert({ name: `Phone in meetings ${RUN}`, stars: 3 }).select()))[0]
  const give = (client, extra) => fn(client, 'star-record', { user: empA.id, rule: byHand.id, date: day, ...extra })
  await denied('an employee cannot give stars', () => give(sbEmpA))
  await denied('a manager cannot give stars', () => give(sbMgrA))
  const given = await give(sbAdmin, { note: 'Client call' })
  check('an admin gives stars by hand', !given.error, given.error?.message)
  check('the server stamps who gave them', given.data?.given_by === admin.id)
  await denied('the same rule twice on one day is refused', () => give(sbAdmin))
  await denied('an automatic rule is not given by hand (only excused)', () => give(sbAdmin, { rule: late.id }))
  await allowed('an admin excuses an automatic star for a day', () => give(sbAdmin, { rule: late.id, excused: true }))
  await denied('stars for a day that hasn’t happened are refused', () => give(sbAdmin, { date: '2099-01-01' }))
  await denied('stars cannot be edited', () => sbAdmin.from('star_records').update({ note: 'x' }).eq('id', given.data?.id ?? 'x').select())
  const empNotes = await must(sbEmpA.from('notifications').select('type, payload'))
  check('the person is told about stars given by hand (not about excuses)', empNotes.filter((n) => n.type === 'stars_given').length === 1)
  await must(root.from('star_records').insert({ user: empB.id, rule: byHand.id, date: day, given_by: admin.id }))
  check('an employee sees only their own stars', (await must(sbEmpA.from('star_records').select('user'))).every((r) => r.user === empA.id))
  check('a manager sees their team’s stars', (await must(sbMgrA.from('star_records').select('user'))).some((r) => r.user === empA.id))
  check('someone in another team sees none of them', (await must(sbEmpB.from('star_records').select('user'))).every((r) => r.user === empB.id))
  await denied('an employee cannot remove stars', () => sbEmpA.from('star_records').delete().eq('id', given.data?.id ?? 'x').select())
  await allowed('an admin removes stars given by hand', () => sbAdmin.from('star_records').delete().eq('id', given.data?.id ?? 'x').select())
  await root.from('star_records').delete().eq('rule', byHand.id)
  await allowed('deleting a by-hand rule is allowed', () => sbAdmin.from('star_rules').delete().eq('id', byHand.id).select())
  await root.from('star_records').delete().eq('rule', late.id).eq('user', empA.id)
  await root.from('star_rules').update({ stars: 0 }).eq('id', late.id)

  // Switch role
  const sw = await orgFn(sbAdmin, 'switch-to', { userId: empA.id })
  check('an admin switches to an employee without a password', !sw.error && !!sw.data?.session?.access_token, sw.error?.message)
  if (sw.data?.session) {
    const asEmp = createClient(URL, env.STAGING_ANON_KEY, opts)
    await asEmp.auth.setSession(sw.data.session)
    const mine = await salaryOf(asEmp)
    check('the token is that employee’s: they see only their own salary', mine.length === 1 && mine[0].user === empA.id, JSON.stringify(mine))
    await denied('the switched-to employee cannot switch on to the admin', () => orgFn(asEmp, 'switch-to', { userId: admin.id }))
  }
  await denied('an employee cannot switch to anyone', () => orgFn(sbEmpA, 'switch-to', { userId: empB.id }))
  await denied('a manager cannot switch to anyone', () => orgFn(sbMgrA, 'switch-to', { userId: empA.id }))
  await denied('a switched-off account cannot be switched to', () => orgFn(sbAdmin, 'switch-to', { userId: gone.id }))
  await denied('nobody signed out can switch', () => orgFn(guest, 'switch-to', { userId: empA.id }))

  // --- old time: only trusted writers (imports, demo data) may store segments over 30 days old ---
  const oldStart = Date.now() - 40 * 86400000
  const oldSeg = (user, n) => ({ id: `${segId.slice(0, 13)}o${n}`, user, state: 'active', started_at: new Date(oldStart).toISOString(), ended_at: new Date(oldStart + 5 * 60000).toISOString() })
  await denied('an employee cannot store a segment older than 30 days', () => sbEmpA.from('activity_segments').insert(oldSeg(empA.id, 1)).select())
  await allowed('a trusted import can store a segment older than 30 days', () => root.from('activity_segments').insert(oldSeg(empA.id, 2)).select())

  // --- not signed in: nothing ---------------------------------------------------------------
  const anon = createClient(URL, env.STAGING_ANON_KEY, opts)
  check('someone not signed in reads nothing', (await anon.from('profiles').select('id')).data?.length === 0 && (await anon.from('teams').select('id')).data?.length === 0)
} catch (e) {
  failed++
  console.error('ERROR', e?.message ?? e)
} finally {
  // Clean up: deleting the accounts removes their profiles, salaries, segments, leave, etc.
  // Finalized test runs are locked even for the service role: delete them with the guards off.
  const ref = new globalThis.URL(URL).hostname.split('.')[0]
  const db = postgres({ host: env.STAGING_DB_HOST, port: 5432, database: 'postgres', username: `postgres.${ref}`, password: env.STAGING_DB_PASSWORD, ssl: 'require', prepare: false })
  for (const id of created.runs.filter(Boolean)) {
    await db.begin(async (tx) => {
      await tx`set local app.bypass_guards = 'on'`
      await tx`delete from payroll_runs where id = ${id}`
    })
  }
  await db.end()
  for (const id of created.clients) await root.from('clients').delete().eq('id', id)
  for (const id of created.events.filter(Boolean)) await root.from('events').delete().eq('id', id)
  for (const id of created.holidays) await root.from('holidays').delete().eq('id', id)
  for (const id of created.users) await root.auth.admin.deleteUser(id)
  for (const id of created.teams) await root.from('teams').delete().eq('id', id)
  await root.from('star_rules').delete().like('name', `%${RUN}`)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
}
