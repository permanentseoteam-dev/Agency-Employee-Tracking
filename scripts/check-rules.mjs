// Verifies the API rules in plan.md §5 against a throwaway PocketBase.
// Usage: npm run check:rules   (needs server\pocketbase.exe; never touches server\pb_data)
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import PocketBase from 'pocketbase'

const ROOT = resolve(import.meta.dirname, '..')
const EXE = join(ROOT, 'server', 'pocketbase.exe')
const MIGRATIONS = join(ROOT, 'server', 'pb_migrations')
const HOOKS = join(ROOT, 'server', 'pb_hooks')
const PORT = 8097
const URL = `http://127.0.0.1:${PORT}`
const PASS = 'Test-pass-12345'

const dir = mkdtempSync(join(tmpdir(), 'agency-rules-'))
const common = ['--dir', dir, '--migrationsDir', MIGRATIONS, '--hooksDir', HOOKS]

let failed = 0
let passed = 0
function check(name, ok, detail = '') {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  (${detail})`}`)
}
async function allowed(name, fn) {
  try {
    await fn()
    check(name, true)
  } catch (e) {
    check(name, false, `${e.status} ${e.message}`)
  }
}
async function denied(name, fn) {
  try {
    await fn()
    check(name, false, 'request was allowed')
  } catch (e) {
    check(name, e.status >= 400 && e.status < 500, `${e.status} ${e.message}`)
  }
}

const server = (() => {
  execFileSync(EXE, ['migrate', 'up', ...common], { stdio: 'ignore' })
  execFileSync(EXE, ['superuser', 'upsert', 'root@test.local', PASS, ...common], { stdio: 'ignore' })
  return spawn(EXE, ['serve', '--http', `127.0.0.1:${PORT}`, ...common], { stdio: 'ignore' })
})()

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${URL}/api/health`)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('PocketBase did not start')
}

async function as(email) {
  const pb = new PocketBase(URL)
  pb.autoCancellation(false)
  await pb.collection('users').authWithPassword(email, PASS)
  return pb
}

try {
  await waitForServer()
  const root = new PocketBase(URL)
  root.autoCancellation(false)
  await root.collection('_superusers').authWithPassword('root@test.local', PASS)

  // --- fixtures ---------------------------------------------------------------
  const mkUser = (email, role, extra = {}) =>
    root.collection('users').create({
      email,
      password: PASS,
      passwordConfirm: PASS,
      full_name: email.split('@')[0],
      role,
      active: true,
      ...extra
    })
  const admin = await mkUser('admin@test.local', 'admin')
  const mgrA = await mkUser('mgr.a@test.local', 'manager')
  const mgrB = await mkUser('mgr.b@test.local', 'manager')
  const teamA = await root.collection('teams').create({ name: 'Team A', manager: mgrA.id })
  const teamB = await root.collection('teams').create({ name: 'Team B', manager: mgrB.id })
  await root.collection('users').update(mgrA.id, { team: teamA.id })
  await root.collection('users').update(mgrB.id, { team: teamB.id })
  const empA = await mkUser('emp.a@test.local', 'employee', { team: teamA.id })
  const empB = await mkUser('emp.b@test.local', 'employee', { team: teamB.id })
  await mkUser('gone@test.local', 'employee', { team: teamA.id, active: false, left_on: '2026-09-30' })
  for (const u of [admin, mgrA, mgrB, empA, empB]) {
    await root.collection('salaries').create({ user: u.id, monthly_salary_pkr: 100000 })
    await root.collection('presence').create({ user: u.id, status: 'offline' })
  }
  const sick = await root.collection('leave_types').getFirstListItem('name = "Sick"')

  const pbAdmin = await as('admin@test.local')
  const pbMgrA = await as('mgr.a@test.local')
  const pbEmpA = await as('emp.a@test.local')

  // Segments must pass segments.pb.js (not in the future, at most 6 min, no overlap), so use recent times.
  const base = Date.now() - 60 * 60000
  const seg = (user, minute) => ({
    user,
    state: 'active',
    started_at: new Date(base + minute * 60000).toISOString(),
    ended_at: new Date(base + (minute + 5) * 60000).toISOString()
  })

  // --- login ------------------------------------------------------------------
  await denied('inactive user cannot log in', () => as('gone@test.local'))

  // --- seed data ---------------------------------------------------------------
  const settings = await pbEmpA.collection('org_settings').getFullList()
  check('seed: one org_settings record with 09:00 shift', settings.length === 1 && settings[0].shift_start === '09:00')
  const types = await pbEmpA.collection('leave_types').getFullList()
  check('seed: 3 leave types', types.length === 3)
  const s = await root.settings.getAll()
  check('backups: daily 21:00 UTC, keep 14', s.backups.cron === '0 21 * * *' && s.backups.cronMaxKeep === 14)
  const usersCol = await root.collections.getOne('users')
  check('users token lasts 30 days', usersCol.authToken.duration === 2592000)

  // --- salaries & payroll -----------------------------------------------------
  check('employee sees no salaries', (await pbEmpA.collection('salaries').getFullList()).length === 0)
  check('manager sees no salaries', (await pbMgrA.collection('salaries').getFullList()).length === 0)
  check('admin sees all 5 salaries', (await pbAdmin.collection('salaries').getFullList()).length === 5)
  await denied('employee cannot create a payroll run', () =>
    pbEmpA.collection('payroll_runs').create({ month: '2026-10', status: 'draft' })
  )
  await allowed('admin can create a payroll run', () =>
    pbAdmin.collection('payroll_runs').create({ month: '2026-10', status: 'draft' })
  )

  // --- users ------------------------------------------------------------------
  await allowed('employee can edit own phone', () => pbEmpA.collection('users').update(empA.id, { phone: '0300' }))
  await denied('employee cannot make self admin', () => pbEmpA.collection('users').update(empA.id, { role: 'admin' }))
  await denied('employee cannot change own team', () => pbEmpA.collection('users').update(empA.id, { team: teamB.id }))
  await denied('employee cannot edit someone else', () => pbEmpA.collection('users').update(empB.id, { phone: '1' }))
  await denied('employee cannot create users', () =>
    pbEmpA.collection('users').create({ email: 'x@test.local', password: PASS, passwordConfirm: PASS, role: 'admin' })
  )
  await allowed('admin can change a role', () => pbAdmin.collection('users').update(empB.id, { designation: 'Dev' }))
  const seenByEmp = await pbEmpA.collection('users').getOne(empB.id)
  check('employee cannot see other emails', !seenByEmp.email)
  const seenByAdmin = await pbAdmin.collection('users').getOne(empB.id)
  check('admin can see emails', seenByAdmin.email === 'emp.b@test.local')

  // --- activity segments --------------------------------------------------------
  const own = await pbEmpA.collection('activity_segments').create({ id: 'segtestaaaaaaa1', ...seg(empA.id, 0) })
  check('employee can create own segment with client id', own.id === 'segtestaaaaaaa1')
  await denied('duplicate segment id is rejected', () =>
    pbEmpA.collection('activity_segments').create({ id: 'segtestaaaaaaa1', ...seg(empA.id, 0) })
  )
  await denied('employee cannot create a segment for someone else', () =>
    pbEmpA.collection('activity_segments').create(seg(empB.id, 10))
  )
  await denied('employee cannot edit own segment', () =>
    pbEmpA.collection('activity_segments').update(own.id, { state: 'idle' })
  )
  await denied('employee cannot delete own segment', () => pbEmpA.collection('activity_segments').delete(own.id))
  await denied('overlapping segment is rejected', () => pbEmpA.collection('activity_segments').create(seg(empA.id, 2)))
  await denied('segment from a clock set 1 hour ahead is rejected', () =>
    pbEmpA.collection('activity_segments').create(seg(empA.id, 120))
  )
  await root.collection('activity_segments').create(seg(empB.id, 20))
  check('employee sees only own segments', (await pbEmpA.collection('activity_segments').getFullList()).length === 1)
  check('manager A sees team A segments only', (await pbMgrA.collection('activity_segments').getFullList()).length === 1)
  check('admin sees all segments', (await pbAdmin.collection('activity_segments').getFullList()).length === 2)

  // --- presence (Live Board) ----------------------------------------------------
  const mgrBoard = await pbMgrA.collection('presence').getFullList()
  check('manager A board shows self + emp A only', mgrBoard.length === 2 && !mgrBoard.some((p) => p.user === empB.id))
  check('admin board shows everyone', (await pbAdmin.collection('presence').getFullList()).length === 5)
  const myPresence = await pbEmpA.collection('presence').getFirstListItem(`user = "${empA.id}"`)
  await allowed('employee can update own presence', () =>
    pbEmpA.collection('presence').update(myPresence.id, { status: 'active', today_active_s: 60 })
  )
  await denied('employee cannot move presence to another user', () =>
    pbEmpA.collection('presence').update(myPresence.id, { user: empB.id })
  )

  // --- attendance & notifications are hook-only ---------------------------------
  await denied('employee cannot write attendance', () =>
    pbEmpA.collection('attendance').create({ user: empA.id, date: '2026-10-14', status: 'present' })
  )
  await denied('admin cannot write attendance directly either', () =>
    pbAdmin.collection('attendance').create({ user: empA.id, date: '2026-10-14', status: 'present' })
  )
  await denied('users cannot create notifications', () =>
    pbEmpA.collection('notifications').create({ user: empA.id, type: 'x' })
  )

  // --- attendance recompute route (admins only) ----------------------------------
  const yesterday = new Date(Date.now() + 5 * 3600000 - 86400000).toISOString().slice(0, 10) // Karachi
  const recompute = (pb) => pb.send('/api/attendance/recompute', { method: 'POST', body: { date: yesterday } })
  await denied('employee cannot recompute attendance', () => recompute(pbEmpA))
  await denied('manager cannot recompute attendance', () => recompute(pbMgrA))
  await allowed('admin can recompute attendance', () => recompute(pbAdmin))
  const myAttendance = await pbEmpA.collection('attendance').getFullList()
  check('employee sees only own attendance', myAttendance.length === 1 && myAttendance[0].user === empA.id, JSON.stringify(myAttendance))
  const teamAttendance = await pbMgrA.collection('attendance').getFullList()
  check(
    'manager A sees team A attendance only (no record for someone who already left)',
    teamAttendance.length === 2 && teamAttendance.every((r) => [mgrA.id, empA.id].includes(r.user)),
    JSON.stringify(teamAttendance.map((r) => r.user))
  )

  // --- leave ------------------------------------------------------------------
  const leave = (user, extra = {}) => ({
    user,
    leave_type: sick.id,
    start_date: '2026-10-20',
    end_date: '2026-10-20',
    days: 1,
    status: 'pending',
    ...extra
  })
  const reqA = await pbEmpA.collection('leave_requests').create(leave(empA.id))
  check('employee can apply for leave', reqA.status === 'pending')
  await denied('employee cannot apply as approved', () =>
    pbEmpA.collection('leave_requests').create(leave(empA.id, { start_date: '2026-10-21', end_date: '2026-10-21', status: 'approved' }))
  )
  await denied('employee cannot approve own leave', () =>
    pbEmpA.collection('leave_requests').update(reqA.id, { status: 'approved' })
  )
  const reqB = await root.collection('leave_requests').create(leave(empB.id))
  await denied('manager A cannot approve team B leave', () =>
    pbMgrA.collection('leave_requests').update(reqB.id, { status: 'approved' })
  )
  await allowed('manager A approves team A leave', () =>
    pbMgrA.collection('leave_requests').update(reqA.id, { status: 'approved', approver: mgrA.id })
  )
  const reqMgr = await pbMgrA.collection('leave_requests').create(leave(mgrA.id))
  await denied('manager cannot approve own leave', () =>
    pbMgrA.collection('leave_requests').update(reqMgr.id, { status: 'approved' })
  )
  await allowed('admin approves the manager leave', () =>
    pbAdmin.collection('leave_requests').update(reqMgr.id, { status: 'approved', approver: admin.id })
  )
  const reqA2 = await pbEmpA.collection('leave_requests').create(leave(empA.id, { start_date: '2026-10-22', end_date: '2026-10-22' }))
  await allowed('employee can cancel own pending leave', () =>
    pbEmpA.collection('leave_requests').update(reqA2.id, { status: 'cancelled' })
  )

  // --- leave notifications (notifications.pb.js) ---------------------------------
  const mgrNotes = await pbMgrA.collection('notifications').getFullList()
  const adminNotes = await pbAdmin.collection('notifications').getFullList()
  const empNotes = await pbEmpA.collection('notifications').getFullList()
  check('manager A is notified of a team A request', mgrNotes.some((n) => n.type === 'leave_requested' && n.payload.request === reqA.id))
  check('a manager’s own request goes to the admins, not to themselves',
    adminNotes.some((n) => n.type === 'leave_requested' && n.payload.request === reqMgr.id) &&
      !mgrNotes.some((n) => n.type === 'leave_requested' && n.payload.request === reqMgr.id))
  check('the manager hears the admin’s decision on their own request',
    mgrNotes.some((n) => n.type === 'leave_decided' && n.payload.request === reqMgr.id && n.payload.status === 'approved'))
  const decided = empNotes.find((n) => n.type === 'leave_decided' && n.payload.request === reqA.id)
  check('employee is notified of the decision', decided?.payload.status === 'approved', JSON.stringify(empNotes))
  check('cancelling notifies nobody', !empNotes.some((n) => n.payload.request === reqA2.id))
  check('everyone sees only their own notifications',
    mgrNotes.every((n) => n.user === mgrA.id) && empNotes.every((n) => n.user === empA.id) && adminNotes.every((n) => n.user === admin.id))
  const noteId = decided?.id ?? 'missing'
  await allowed('employee can mark own notification read', () =>
    pbEmpA.collection('notifications').update(noteId, { read_at: new Date().toISOString() })
  )
  await denied('employee cannot hand a notification to someone else', () =>
    pbEmpA.collection('notifications').update(noteId, { user: mgrA.id })
  )
  await denied('employee cannot rewrite a notification', () =>
    pbEmpA.collection('notifications').update(noteId, { payload: { status: 'approved', comment: 'fake' } })
  )
  await denied('manager cannot mark someone else’s notification read', () =>
    pbMgrA.collection('notifications').update(noteId, { read_at: new Date().toISOString() })
  )

  // --- payroll route and the finalized lock (payroll.pb.js) ----------------------
  const runPayroll = (pb, month = '2026-10') => pb.send('/api/payroll/run', { method: 'POST', body: { month } })
  await denied('employee cannot run payroll', () => runPayroll(pbEmpA))
  await denied('manager cannot run payroll', () => runPayroll(pbMgrA))
  await denied('payroll cannot be run for a future month', () => runPayroll(pbAdmin, '2099-01'))
  await denied('a run cannot be created already finalized', () =>
    pbAdmin.collection('payroll_runs').create({ month: '2026-08', status: 'finalized' })
  )
  let run = { items: 0 }
  await allowed('admin runs payroll (reusing the draft made above)', async () => {
    run = await runPayroll(pbAdmin)
  })
  check('one line per employee with a salary (not someone who left in September)', run.items === 5, JSON.stringify(run))
  const line = await pbAdmin.collection('payroll_items').getFirstListItem(`run = "${run.run}" && user = "${empA.id}"`)
  check('employees cannot read payroll', (await pbEmpA.collection('payroll_items').getFullList()).length === 0)
  await allowed('admin sets an adjustment and note on a draft line', () =>
    pbAdmin.collection('payroll_items').update(line.id, { adjustment_pkr: -5000, note: 'Advance' })
  )
  const adjusted = await pbAdmin.collection('payroll_items').getOne(line.id)
  check('net follows the adjustment', adjusted.net === adjusted.base - adjusted.deductions - 5000, JSON.stringify(adjusted))
  await denied('the counted figures cannot be edited', () => pbAdmin.collection('payroll_items').update(line.id, { deductions: 0 }))
  await runPayroll(pbAdmin)
  const recounted = await pbAdmin.collection('payroll_items').getFirstListItem(`run = "${run.run}" && user = "${empA.id}"`)
  check('recounting a draft keeps adjustments and notes', recounted.adjustment_pkr === -5000 && recounted.note === 'Advance')
  await allowed('admin finalizes the run', () => pbAdmin.collection('payroll_runs').update(run.run, { status: 'finalized' }))
  await denied('a finalized run cannot be reopened', () => pbAdmin.collection('payroll_runs').update(run.run, { status: 'draft' }))
  await denied('a finalized run cannot be deleted', () => pbAdmin.collection('payroll_runs').delete(run.run))
  await denied('a finalized line cannot be edited', () => pbAdmin.collection('payroll_items').update(recounted.id, { adjustment_pkr: 0 }))
  await denied('a finalized line cannot be deleted', () => pbAdmin.collection('payroll_items').delete(recounted.id))
  await denied('lines cannot be added to a finalized run', () =>
    pbAdmin.collection('payroll_items').create({ run: run.run, user: admin.id, base: 1 })
  )
  await denied('a finalized month cannot be recounted', () => runPayroll(pbAdmin))
  await denied('not even a superuser can edit a finalized line', () =>
    root.collection('payroll_items').update(recounted.id, { adjustment_pkr: 0 })
  )

  // --- leave balances view -------------------------------------------------------
  const myBal = await pbEmpA.collection('leave_balances').getFullList()
  const mySick = myBal.find((b) => b.leave_type === sick.id)
  check('employee sees only own 3 balances', myBal.length === 3 && myBal.every((b) => b.user === empA.id))
  check('Sick balance: 8 − 1 approved = 7', mySick?.used === 1 && mySick?.remaining === 7, JSON.stringify(mySick))
  const mgrBal = await pbMgrA.collection('leave_balances').getFullList()
  check('manager A sees own + team A balances (inactive excluded)', mgrBal.length === 6, `got ${mgrBal.length}`)

  // --- shared data -------------------------------------------------------------
  await denied('employee cannot change org settings', () =>
    pbEmpA.collection('org_settings').update(settings[0].id, { grace_minutes: 60 })
  )
  await allowed('admin can change org settings', () =>
    pbAdmin.collection('org_settings').update(settings[0].id, { grace_minutes: 15 })
  )
  await denied('employee cannot add holidays', () =>
    pbEmpA.collection('holidays').create({ date: '2026-12-25', name: 'Quaid Day' })
  )
  await allowed('admin can add holidays', () =>
    pbAdmin.collection('holidays').create({ date: '2026-12-25', name: 'Quaid Day' })
  )
  await denied('bad date format is rejected', () =>
    pbAdmin.collection('holidays').create({ date: '25-12-2026', name: 'x' })
  )

  // --- calendar events (admins write; everyone reads; events.pb.js checks times) ---
  const event = { title: 'Town hall', starts_at: '2026-10-16 10:00:00.000Z', ends_at: '2026-10-16 11:00:00.000Z' }
  await denied('employee cannot add events', () => pbEmpA.collection('events').create(event))
  await denied('manager cannot add events', () => pbMgrA.collection('events').create(event))
  let townHall = null
  await allowed('admin can add a company-wide event', async () => {
    townHall = await pbAdmin.collection('events').create(event)
  })
  await allowed('admin can add a team event', () => pbAdmin.collection('events').create({ ...event, title: 'Team A sync', team: teamA.id }))
  check('everyone can read events', (await pbEmpA.collection('events').getFullList()).length === 2)
  await denied('an event cannot end before it starts', () =>
    pbAdmin.collection('events').create({ ...event, ends_at: '2026-10-16 09:00:00.000Z' })
  )
  await denied('an event cannot be moved to end before it starts', () =>
    pbAdmin.collection('events').update(townHall?.id ?? 'missing', { ends_at: '2026-10-16 10:00:00.000Z' })
  )

  // --- organization routes (invite.pb.js) ---------------------------------------
  const invite = (pb, extra = {}) =>
    pb.send('/api/org/invite', {
      method: 'POST',
      body: {
        email: 'new.hire@test.local',
        full_name: 'New Hire',
        password: 'temp-pass-1',
        team: teamA.id,
        role: 'employee',
        joined_on: '2026-10-14',
        monthly_salary_pkr: 70000,
        ...extra
      }
    })
  await denied('employee cannot add employees', () => invite(pbEmpA))
  await denied('manager cannot add employees', () => invite(pbMgrA))
  let hireId = ''
  await allowed('admin adds an employee', async () => {
    hireId = (await invite(pbAdmin)).id
  })
  await denied('duplicate email is rejected', () => invite(pbAdmin, { email: 'NEW.HIRE@test.local' }))
  await denied('short temporary password is rejected', () => invite(pbAdmin, { email: 'x2@test.local', password: 'short' }))
  const hireSalary = await pbAdmin.collection('salaries').getFirstListItem(`user = "${hireId}"`)
  check('invite also creates the salary record', hireSalary.monthly_salary_pkr === 70000)
  let noSalaryHire = null
  await allowed('an employee can be added before their salary is known', async () => {
    noSalaryHire = await pbAdmin.send('/api/org/invite', {
      method: 'POST',
      body: { email: 'no.salary@test.local', full_name: 'No Salary Yet', password: 'temp-pass-1', monthly_salary_pkr: '' }
    })
  })
  check('their salary is stored as 0 (not set)',
    (await pbAdmin.collection('salaries').getFirstListItem(`user = "${noSalaryHire?.id}"`).catch(() => null))?.monthly_salary_pkr === 0)
  const pbHire = await as('new.hire@test.local').catch(() => null)
  // as() uses PASS; the hire has a temporary password, so sign in directly
  const hire = new PocketBase(URL)
  hire.autoCancellation(false)
  await hire.collection('users').authWithPassword('new.hire@test.local', 'temp-pass-1')
  check('new hire signs in with the temporary password', !pbHire && hire.authStore.isValid)
  check('new hire must change the password', hire.authStore.record.must_change_password === true)
  check('new hire is in team A', hire.authStore.record.team === teamA.id)

  await denied('employee cannot reset passwords', () =>
    pbEmpA.send('/api/org/reset-password', { method: 'POST', body: { userId: hireId, password: 'another-pass-1' } })
  )
  await allowed('admin resets a password', () =>
    pbAdmin.send('/api/org/reset-password', { method: 'POST', body: { userId: hireId, password: 'another-pass-1' } })
  )
  await denied('reset signs out the old session', () => hire.collection('users').authRefresh())
  await allowed('new temporary password works', () =>
    hire.collection('users').authWithPassword('new.hire@test.local', 'another-pass-1')
  )

  await denied('manager cannot deactivate people', () =>
    pbMgrA.send('/api/org/set-active', { method: 'POST', body: { userId: hireId, active: false } })
  )
  await denied('admin cannot deactivate themselves', () =>
    pbAdmin.send('/api/org/set-active', { method: 'POST', body: { userId: admin.id, active: false } })
  )
  await allowed('admin deactivates an employee', () =>
    pbAdmin.send('/api/org/set-active', { method: 'POST', body: { userId: hireId, active: false, left_on: '2026-10-31' } })
  )
  await denied('deactivation signs them out immediately', () => hire.collection('users').authRefresh())
  await denied('deactivated employee cannot log in', () =>
    hire.collection('users').authWithPassword('new.hire@test.local', 'another-pass-1')
  )
  const gone = await pbAdmin.collection('users').getOne(hireId)
  check('leaving date is recorded', gone.left_on === '2026-10-31' && gone.active === false)
  await allowed('admin reactivates the employee', () =>
    pbAdmin.send('/api/org/set-active', { method: 'POST', body: { userId: hireId, active: true } })
  )
  await allowed('reactivated employee can log in', () =>
    hire.collection('users').authWithPassword('new.hire@test.local', 'another-pass-1')
  )
} catch (e) {
  failed++
  console.error('ERROR', e?.status ?? '', e?.message ?? e, e?.response ? JSON.stringify(e.response) : '')
} finally {
  server.kill()
  await new Promise((r) => setTimeout(r, 500))
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {}
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
}
