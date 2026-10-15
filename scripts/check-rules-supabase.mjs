// Verifies the Supabase row-level security and guard triggers against the STAGING project:
// the table checks of scripts/check-rules.mjs (PocketBase), with the same names and the same
// expected allow/deny. Route checks (leave, payroll run, accounts, projects status…) join in
// step 3, once the Edge Functions exist.
// Usage: node scripts/check-rules-supabase.mjs   (reads STAGING_* from .env.supabase; never live)
// It creates its own throwaway accounts and rows and deletes them again at the end.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
  for (const id of created.runs) await root.from('payroll_runs').delete().eq('id', id)
  for (const id of created.clients) await root.from('clients').delete().eq('id', id)
  for (const id of created.events.filter(Boolean)) await root.from('events').delete().eq('id', id)
  for (const id of created.holidays) await root.from('holidays').delete().eq('id', id)
  for (const id of created.users) await root.auth.admin.deleteUser(id)
  for (const id of created.teams) await root.from('teams').delete().eq('id', id)
  await root.from('star_rules').delete().like('name', `%${RUN}`)
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
}
