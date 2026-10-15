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
const PORT = Number(process.env.CHECK_RULES_PORT) || 8097
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
  check('backups: daily 08:00 UTC (13:00 PKT), keep 14', s.backups.cron === '0 8 * * *' && s.backups.cronMaxKeep === 14)
  const usersCol = await root.collections.getOne('users')
  check('users token lasts 30 days', usersCol.authToken.duration === 2592000)

  // --- salaries & payroll -----------------------------------------------------
  const empSalaries = await pbEmpA.collection('salaries').getFullList()
  check('employee sees only their own salary', empSalaries.length === 1 && empSalaries[0].user === empA.id, `got ${empSalaries.length}`)
  const mgrSalaries = await pbMgrA.collection('salaries').getFullList()
  check('manager sees only their own salary', mgrSalaries.length === 1 && mgrSalaries[0].user === mgrA.id, `got ${mgrSalaries.length}`)
  await denied('employee cannot change their own salary', () =>
    pbEmpA.collection('salaries').update(empSalaries[0]?.id ?? 'missing', { monthly_salary_pkr: 999999 })
  )
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
  check('an employee sees no draft payroll (run or line)',
    (await pbEmpA.collection('payroll_items').getFullList()).length === 0 && (await pbEmpA.collection('payroll_runs').getFullList()).length === 0)
  await denied('an employee cannot edit their own payroll line', () =>
    pbEmpA.collection('payroll_items').update(line.id, { adjustment_pkr: 99999 })
  )
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
  const empLines = await pbEmpA.collection('payroll_items').getFullList({ expand: 'run' })
  check('once finalized, the employee sees only their own line and its month',
    empLines.length === 1 && empLines[0].user === empA.id && empLines[0].expand?.run?.status === 'finalized', JSON.stringify(empLines.map((l) => l.user)))
  const mgrLines = await pbMgrA.collection('payroll_items').getFullList()
  check('the manager sees only their own line, not their team’s', mgrLines.length === 1 && mgrLines[0].user === mgrA.id, `got ${mgrLines.length}`)
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

  // --- leave rules (leave.pb.js): counted days, overlap, quota, locks, routing ----
  const casual = await root.collection('leave_types').getFirstListItem('name = "Casual"')
  const apply = (pb, user, extra) => pb.collection('leave_requests').create({ user, leave_type: casual.id, ...extra })
  await root.collection('holidays').create({ date: '2026-11-04', name: 'Test holiday' })
  let week = null
  await allowed('employee applies Mon–Fri with a holiday inside', async () => {
    week = await apply(pbEmpA, empA.id, { start_date: '2026-11-02', end_date: '2026-11-06', days: 99, reason: 'Trip' })
  })
  check('the server counts the days (5 working days − 1 holiday = 4)', week?.days === 4, JSON.stringify(week))
  const half = await apply(pbEmpA, empA.id, { start_date: '2026-11-09', end_date: '2026-11-09', half_day: true }).catch(() => null)
  check('a half day counts 0.5', half?.days === 0.5, JSON.stringify(half))
  await denied('a half day over two days is refused', () =>
    apply(pbEmpA, empA.id, { start_date: '2026-11-10', end_date: '2026-11-11', half_day: true }))
  await denied('a weekend-only request is refused (no working days)', () =>
    apply(pbEmpA, empA.id, { start_date: '2026-11-14', end_date: '2026-11-15' }))
  await denied('an end before the start is refused', () =>
    apply(pbEmpA, empA.id, { start_date: '2026-11-12', end_date: '2026-11-11' }))
  await denied('a request across the new year is refused', () =>
    apply(pbEmpA, empA.id, { start_date: '2026-12-31', end_date: '2027-01-01' }))
  await denied('a request overlapping your own pending leave is refused', () =>
    apply(pbEmpA, empA.id, { start_date: '2026-11-05', end_date: '2026-11-05' }))
  await denied('paid leave past the yearly quota is refused (4.5 pending + 10 > 10)', () =>
    apply(pbEmpA, empA.id, { start_date: '2026-11-16', end_date: '2026-11-27' }))
  const unpaid = await pbAdmin.collection('leave_types').create({ name: 'Unpaid', yearly_quota_days: 0, paid: false })
  await allowed('unpaid leave has no quota', () =>
    apply(pbEmpA, empA.id, { leave_type: unpaid.id, start_date: '2026-11-16', end_date: '2026-11-27' }))
  await root.collection('users').update(empB.id, { joined_on: '2026-11-01' })
  const pbEmpB = await as('emp.b@test.local')
  await denied('leave before the joining date is refused', () =>
    apply(pbEmpB, empB.id, { start_date: '2026-10-30', end_date: '2026-11-02' }))
  await root.collection('users').update(empB.id, { joined_on: '' })

  await denied('the employee cannot edit a sent request', () =>
    pbEmpA.collection('leave_requests').update(week?.id ?? 'missing', { end_date: '2026-11-05' }))
  await denied('the employee cannot change the dates while cancelling', () =>
    pbEmpA.collection('leave_requests').update(half?.id ?? 'missing', { status: 'cancelled', end_date: '2026-11-10' }))
  const cancelled = await pbEmpA.collection('leave_requests').update(half?.id ?? 'missing', { status: 'cancelled' }).catch(() => null)
  check('an employee’s own cancel is not stamped as a decision', cancelled?.status === 'cancelled' && !cancelled.approver && !cancelled.decided_at)
  await denied('a manager cannot change the days while deciding', () =>
    pbMgrA.collection('leave_requests').update(week?.id ?? 'missing', { status: 'approved', days: 1 }))
  await denied('a manager cannot cancel a pending request (the employee does)', () =>
    pbMgrA.collection('leave_requests').update(week?.id ?? 'missing', { status: 'cancelled' }))
  let approved = null
  await allowed('manager A approves with a comment', async () => {
    approved = await pbMgrA.collection('leave_requests').update(week?.id ?? 'missing', { status: 'approved', comment: 'Enjoy', approver: admin.id })
  })
  check('the server sets the approver and decision time', approved?.approver === mgrA.id && !!approved?.decided_at, JSON.stringify(approved))
  await denied('a manager cannot reverse a decision', () =>
    pbMgrA.collection('leave_requests').update(week?.id ?? 'missing', { status: 'rejected' }))
  await denied('the employee cannot cancel approved leave', () =>
    pbEmpA.collection('leave_requests').update(week?.id ?? 'missing', { status: 'cancelled' }))
  await allowed('admin reverses: approved → rejected', () =>
    pbAdmin.collection('leave_requests').update(week?.id ?? 'missing', { status: 'rejected', comment: 'Busy week' }))
  await denied('a manager cannot rewrite the comment on an admin’s decision', () =>
    pbMgrA.collection('leave_requests').update(week?.id ?? 'missing', { comment: 'Overruled' }))
  await allowed('admin reverses: rejected → approved', () =>
    pbAdmin.collection('leave_requests').update(week?.id ?? 'missing', { status: 'approved' }))
  await allowed('admin cancels approved leave', () =>
    pbAdmin.collection('leave_requests').update(week?.id ?? 'missing', { status: 'cancelled' }))
  check('the admin is now the approver', (await pbAdmin.collection('leave_requests').getOne(week?.id ?? 'missing')).approver === admin.id)
  await denied('a cancelled request cannot be reopened', () =>
    pbAdmin.collection('leave_requests').update(week?.id ?? 'missing', { status: 'approved' }))

  await root.collection('users').update(mgrB.id, { team: teamA.id })
  const pbMgrB = await as('mgr.b@test.local')
  const mgrBReq = await apply(pbMgrB, mgrB.id, { start_date: '2026-11-03', end_date: '2026-11-03' })
  await denied('a manager in another manager’s team still goes to the admins', () =>
    pbMgrA.collection('leave_requests').update(mgrBReq.id, { status: 'approved' }))
  await allowed('an admin decides that manager’s request', () =>
    pbAdmin.collection('leave_requests').update(mgrBReq.id, { status: 'approved' }))
  await root.collection('users').update(mgrB.id, { team: teamB.id })
  const adminReq = await apply(pbAdmin, admin.id, { start_date: '2026-11-05', end_date: '2026-11-05' })
  await denied('a manager cannot decide the admin’s own leave', () =>
    pbMgrA.collection('leave_requests').update(adminReq.id, { status: 'approved' }))
  await allowed('the admin cancels their own pending request', () =>
    pbAdmin.collection('leave_requests').update(adminReq.id, { status: 'cancelled' }))

  const imported = await root.collection('leave_requests').create({
    user: empB.id, leave_type: casual.id, start_date: '2026-11-10', end_date: '2026-11-10', status: 'approved'
  })
  check('a superuser import keeps its status and gets its days counted', imported.status === 'approved' && imported.days === 1, JSON.stringify(imported))

  // Approving leave for a finished working day re-counts that day's attendance at once.
  let pastDay = yesterday
  while ([0, 6].includes(new Date(`${pastDay}T00:00:00Z`).getUTCDay())) {
    pastDay = new Date(Date.parse(`${pastDay}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
  }
  await pbAdmin.send('/api/attendance/recompute', { method: 'POST', body: { date: pastDay } })
  const sick1 = await apply(pbEmpA, empA.id, { start_date: pastDay, end_date: pastDay, reason: 'Fever' })
  await pbMgrA.collection('leave_requests').update(sick1.id, { status: 'approved' })
  const dayStatus = async () =>
    (await pbAdmin.collection('attendance').getFirstListItem(`user = "${empA.id}" && date = "${pastDay}"`).catch(() => null))?.status
  const onLeave = await dayStatus()
  check('approving past leave marks that day On leave', onLeave === 'on_leave', `${pastDay}: ${onLeave}`)
  await pbAdmin.collection('leave_requests').update(sick1.id, { status: 'rejected' })
  const back = await dayStatus()
  check('rejecting it again counts the day as absent', back === 'absent', `${pastDay}: ${back}`)

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

  // --- "Create an account" (register.pb.js): waits for an admin; Approve / Reject -----
  // Exactly 5 guest calls before the rate-limit check: the 6th in a minute is refused.
  const guest = new PocketBase(URL)
  guest.autoCancellation(false)
  const register = (body) => guest.send('/api/register', { method: 'POST', body })
  const signup = { full_name: 'Sara Self', email: 'Sara.Self@test.local', password: 'own-pass-123', phone: '0300 1112223' }
  let selfId = ''
  await allowed('a guest registers', async () => {
    selfId = (await register({ ...signup, role: 'admin', team: teamA.id, active: true, pending_approval: false, monthly_salary_pkr: 99 })).id
  })
  const self = await root.collection('users').getOne(selfId)
  check('a sign-up waits for approval: switched off, employee, no team, whatever the request said',
    self.active === false && self.pending_approval === true && self.role === 'employee' && self.team === '' && self.joined_on === '')
  check('sign-up: email lowercased, phone kept, no forced password change',
    self.email === 'sara.self@test.local' && self.phone === '0300 1112223' && self.must_change_password === false)
  check('sign-up creates the salary record as 0 (not set)',
    (await root.collection('salaries').getFirstListItem(`user = "${selfId}"`).catch(() => null))?.monthly_salary_pkr === 0)
  await denied('registering an existing email is refused', () => register({ ...signup, email: 'SARA.SELF@test.local' }))
  await denied('registering with a short password is refused', () => register({ ...signup, email: 'x3@test.local', password: 'short' }))
  await denied('registering without a name is refused', () => register({ ...signup, email: 'x4@test.local', full_name: ' ' }))
  let secondId = ''
  await allowed('a second person registers', async () => {
    secondId = (await register({ ...signup, email: 'second.self@test.local', full_name: 'Second Self' })).id
  })
  let limited = 0
  try {
    await register({ ...signup, email: 'sixth@test.local' })
  } catch (e) {
    limited = e.status
  }
  check('a 6th sign-up within a minute is refused (rate limit)', limited === 429, `status ${limited}`)

  const selfPb = new PocketBase(URL)
  selfPb.autoCancellation(false)
  let waitingStatus = 0
  try {
    await selfPb.collection('users').authWithPassword('sara.self@test.local', 'own-pass-123')
  } catch (e) {
    waitingStatus = e.status
  }
  check('a sign-up waiting for approval cannot sign in (403)', waitingStatus === 403, `status ${waitingStatus}`)
  const regNotes = await root.collection('notifications').getFullList({ filter: `type = "signup_pending" && payload.user ?= "${selfId}"` })
  check('every active admin is told a sign-up is waiting', regNotes.length === 1 && regNotes[0].user === admin.id && regNotes[0].payload?.name === 'Sara Self')

  const approve = (pb, body) => pb.send('/api/org/approve', { method: 'POST', body })
  const reject = (pb, body) => pb.send('/api/org/reject', { method: 'POST', body })
  await denied('an employee cannot approve sign-ups', () => approve(pbEmpA, { userId: selfId }))
  await denied('a manager cannot approve sign-ups', () => approve(pbMgrA, { userId: selfId }))
  await denied('"Reactivate" cannot switch on a waiting sign-up', () =>
    pbAdmin.send('/api/org/set-active', { method: 'POST', body: { userId: selfId, active: true } })
  )
  await allowed('an admin approves a sign-up', () => approve(pbAdmin, { userId: selfId }))
  const signupApproved = await root.collection("users").getOne(selfId)
  const todayPk = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10)
  check('approved: active, no longer waiting, joined today', signupApproved.active === true && signupApproved.pending_approval === false && signupApproved.joined_on === todayPk)
  await allowed('an approved person signs in', () => selfPb.collection('users').authWithPassword('sara.self@test.local', 'own-pass-123'))
  await denied('they cannot make themselves admin', () => selfPb.collection('users').update(selfId, { role: 'admin' }))
  await denied('they cannot mark themselves as waiting again', () => selfPb.collection('users').update(selfId, { pending_approval: true }))
  await denied('approving twice is refused', () => approve(pbAdmin, { userId: selfId }))
  await denied('an approved account cannot be "rejected"', () => reject(pbAdmin, { userId: selfId }))
  await denied('an employee cannot reject sign-ups', () => reject(pbEmpA, { userId: secondId }))
  await allowed('an admin rejects a sign-up', () => reject(pbAdmin, { userId: secondId }))
  check('a rejected sign-up is deleted, with its salary record',
    (await root.collection('users').getOne(secondId).catch((e) => e.status)) === 404 &&
      (await root.collection('salaries').getFullList({ filter: `user = "${secondId}"` })).length === 0)

  // --- stars instead of the late penalty (stars.pb.js) ---------------------------------
  const refusal = async (fn) => {
    try {
      await fn()
      return ''
    } catch (e) {
      return e.response?.message ?? e.message
    }
  }
  const karachiDay = (offsetDays) => new Date(Date.now() + 5 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
  const starDay = karachiDay(-1)
  const [rules] = await pbEmpA.collection('org_settings').getFullList()
  check('the late penalty is gone from the rules', !('late_penalty_pkr' in rules))
  check('monthly leave limits start at 0 (no limit)', rules.monthly_full_leaves === 0 && rules.monthly_half_leaves === 0)
  const payLines = await pbAdmin.collection('payroll_items').getFullList()
  check('payroll lines have no late count any more', payLines.length > 0 && payLines.every((i) => !('late_count' in i)))

  const starRules = await pbEmpA.collection('star_rules').getFullList()
  check('everyone reads the star rules: 3 automatic ones, 0 stars until set', starRules.filter((r) => r.auto).length === 3 && starRules.every((r) => r.stars === 0))
  const lateRule = starRules.find((r) => r.auto === 'late')
  await denied('an employee cannot change star amounts', () => pbEmpA.collection('star_rules').update(lateRule.id, { stars: 5 }))
  await denied('a manager cannot change star amounts', () => pbMgrA.collection('star_rules').update(lateRule.id, { stars: 5 }))
  await allowed('an admin sets the stars for a rule break', () => pbAdmin.collection('star_rules').update(lateRule.id, { stars: 1 }))
  await denied('an automatic rule cannot be deleted', () => pbAdmin.collection('star_rules').delete(lateRule.id))
  await denied('an automatic rule cannot become a by-hand one', () => pbAdmin.collection('star_rules').update(lateRule.id, { auto: '' }))
  await denied('a new rule cannot be automatic', () => pbAdmin.collection('star_rules').create({ name: 'Fake late', stars: 1, auto: 'late' }))
  let phone = null
  await allowed('an admin adds a rule given by hand', async () => {
    phone = await pbAdmin.collection('star_rules').create({ name: 'Phone in meetings', stars: 2 })
  })
  const giveTo = (pb, extra) => pb.collection('star_records').create({ user: empA.id, rule: phone?.id, date: starDay, ...extra })
  await denied('an employee cannot give stars', () => giveTo(pbEmpA, { user: empB.id }))
  await denied('a manager cannot give stars', () => giveTo(pbMgrA))
  let given = null
  await allowed('an admin gives stars by hand', async () => {
    given = await giveTo(pbAdmin, { note: 'Client call' })
  })
  check('the server stamps who gave them', given?.given_by === admin.id, JSON.stringify(given))
  await denied('the same rule twice on one day is refused', () => giveTo(pbAdmin))
  await denied('an automatic rule is not given by hand (only excused)', () => giveTo(pbAdmin, { rule: lateRule.id }))
  await allowed('an admin excuses an automatic star for a day', () => giveTo(pbAdmin, { rule: lateRule.id, excused: true }))
  await denied('stars for a day that hasn’t happened are refused', () => giveTo(pbAdmin, { date: karachiDay(2), note: 'future' }))
  await denied('stars cannot be edited', () => pbAdmin.collection('star_records').update(given?.id ?? 'missing', { note: 'changed' }))
  check('the person is told about stars given by hand (not about excuses)',
    (await pbEmpA.collection('notifications').getFullList({ filter: 'type = "stars_given"' })).length === 1)
  check('an employee sees only their own stars', (await pbEmpA.collection('star_records').getFullList()).length === 2)
  check('a manager sees their team’s stars', (await pbMgrA.collection('star_records').getFullList()).length === 2)
  check('someone in another team sees none of them', (await pbEmpB.collection('star_records').getFullList()).length === 0)
  await denied('an employee cannot remove stars', () => pbEmpA.collection('star_records').delete(given?.id ?? 'missing'))
  await allowed('an admin removes stars given by hand', () => pbAdmin.collection('star_records').delete(given?.id ?? 'missing'))
  await allowed('deleting a by-hand rule is allowed', () => pbAdmin.collection('star_rules').delete(phone?.id ?? 'missing'))

  // --- leave per month (Rules → Leaves per month; leave.pb.js) ------------------------
  await denied('a manager cannot change the monthly leave limits', () =>
    pbMgrA.collection('org_settings').update(rules.id, { monthly_full_leaves: 9 }))
  const febRequest = await apply(pbEmpB, empB.id, { start_date: '2027-02-01', end_date: '2027-02-03' }).catch(() => null)
  check('with no limit, 3 days in a month are fine', febRequest?.days === 3, JSON.stringify(febRequest))
  await allowed('an admin sets the limits: 2 full days and 1 half day a month', () =>
    pbAdmin.collection('org_settings').update(rules.id, { monthly_full_leaves: 2, monthly_half_leaves: 1 }))
  await allowed('2 full days in December fit', () => apply(pbEmpB, empB.id, { start_date: '2026-12-07', end_date: '2026-12-08' }))
  const third = await refusal(() => apply(pbEmpB, empB.id, { start_date: '2026-12-10', end_date: '2026-12-10' }))
  check('a 3rd full day in December is refused', third === 'No full-day leave left in December (limit 2 a month).', third)
  await allowed('a half day (short leave) has its own limit', () =>
    apply(pbEmpB, empB.id, { start_date: '2026-12-11', end_date: '2026-12-11', half_day: true }))
  await denied('a 2nd half day in December is refused', () =>
    apply(pbEmpB, empB.id, { start_date: '2026-12-14', end_date: '2026-12-14', half_day: true }))
  const across = await refusal(() => apply(pbEmpB, empB.id, { start_date: '2026-11-30', end_date: '2026-12-01' }))
  check('a request into a full month is refused for that month', across.includes('in December'), across)
  const lateApproval = await refusal(() => pbAdmin.collection('leave_requests').update(febRequest?.id ?? 'missing', { status: 'approved' }))
  check('approving leave over the limit set since is refused', lateApproval.includes('left for them in February'), lateApproval)
  await allowed('0 means no limit again', () => pbAdmin.collection('org_settings').update(rules.id, { monthly_full_leaves: 0, monthly_half_leaves: 0 }))
  await allowed('…and the same approval then goes through', () =>
    pbAdmin.collection('leave_requests').update(febRequest?.id ?? 'missing', { status: 'approved' }))

  // --- old time: only superusers (imports, demo data) may store segments over 30 days old ---
  const oldStart = Date.now() - 40 * 86400000
  const oldSeg = (user) => ({ user, state: 'active', started_at: new Date(oldStart).toISOString(), ended_at: new Date(oldStart + 5 * 60000).toISOString() })
  await denied('an employee cannot store a segment older than 30 days', () => pbEmpA.collection('activity_segments').create(oldSeg(empA.id)))
  await allowed('a superuser can import a segment older than 30 days', () => root.collection('activity_segments').create(oldSeg(empA.id)))

  // --- the dashboard (superusers) only from the server PC (security.pb.js) ------------
  // Requests through Funnel carry X-Forwarded-For; local ones don't.
  const viaInternet = { 'X-Forwarded-For': '203.0.113.9', 'content-type': 'application/json' }
  const suViaInternet = await fetch(`${URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: viaInternet,
    body: JSON.stringify({ identity: 'root@test.local', password: PASS })
  })
  check('superuser sign-in from the internet is refused', suViaInternet.status === 403, `status ${suViaInternet.status}`)
  const suTokenViaInternet = await fetch(`${URL}/api/collections/users/records`, { headers: { ...viaInternet, Authorization: root.authStore.token } })
  check('a superuser token used from the internet is refused', suTokenViaInternet.status === 403, `status ${suTokenViaInternet.status}`)
  const userViaInternet = await fetch(`${URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: viaInternet,
    body: JSON.stringify({ identity: 'emp.a@test.local', password: PASS })
  })
  check('employees can still sign in from the internet', userViaInternet.status === 200, `status ${userViaInternet.status}`)
  check('superusers still work on the server PC', (await root.collection('users').getList(1, 1)).totalItems > 0)

  // --- projects: clients, their calendars and team status (projects.pb.js) ------------
  const acme = await pbAdmin.collection('clients').create({ name: 'Acme', description: 'Retainer', members: [empA.id, mgrA.id] })
  const north = await root.collection('clients').create({ name: 'North', members: [empB.id] })
  const empClients = await pbEmpA.collection('clients').getFullList()
  check('a member sees only their own clients', empClients.length === 1 && empClients[0].id === acme.id, `got ${empClients.length}`)
  check('someone on no client sees none', (await pbMgrB.collection('clients').getFullList()).length === 0)
  check('the admin sees every client', (await pbAdmin.collection('clients').getFullList()).length === 2)
  await denied('an employee cannot create a client', () => pbEmpA.collection('clients').create({ name: 'Mine' }))
  await denied('a manager cannot add people to a client', () => pbMgrA.collection('clients').update(acme.id, { 'members+': mgrB.id }))
  await denied('a member cannot rename their client', () => pbEmpA.collection('clients').update(acme.id, { name: 'Renamed' }))
  await denied('client names are unique', () => pbAdmin.collection('clients').create({ name: 'acme' }))

  const novAt = (h) => new Date(Date.UTC(2026, 10, 3, h)).toISOString()
  let meeting = null
  await allowed('an employee on the client adds a meeting to its calendar', async () => {
    meeting = await pbEmpA.collection('project_events').create({ client: acme.id, title: 'Kickoff', starts_at: novAt(5), ends_at: novAt(6), created_by: admin.id })
  })
  check('the server records who added it', meeting?.created_by === empA.id, JSON.stringify(meeting))
  await allowed('a manager on the client changes it', () => pbMgrA.collection('project_events').update(meeting?.id ?? 'missing', { title: 'Kickoff call' }))
  await denied('an event cannot end before it starts', () => pbEmpA.collection('project_events').update(meeting?.id ?? 'missing', { ends_at: novAt(4) }))
  await denied('an event cannot move to another client', () => pbAdmin.collection('project_events').update(meeting?.id ?? 'missing', { client: north.id }))
  await denied('someone not on the client cannot add to its calendar', () =>
    pbEmpB.collection('project_events').create({ client: acme.id, title: 'Sneaky', starts_at: novAt(7), ends_at: novAt(8) }))
  check('someone not on the client cannot see its calendar', (await pbEmpB.collection('project_events').getFullList()).length === 0)
  await denied('someone not on the client cannot delete its events', () => pbEmpB.collection('project_events').delete(meeting?.id ?? 'missing'))

  const projectStatus = (pb, client, date) => pb.send('/api/projects/status', { query: date ? { client, date } : { client } })
  let team = null
  await allowed('a member reads their client’s team status', async () => {
    team = await projectStatus(pbEmpA, acme.id)
  })
  check('one row per person on the client', team?.members?.length === 2 && team.members.every((m) => [empA.id, mgrA.id].includes(m.user)), JSON.stringify(team))
  check('status only: no hours or times', !!team?.members?.every((m) => Object.keys(m).sort().join() === 'month,status,user' && Object.keys(m.month).length === 5))
  await denied('someone not on the client cannot read its status', () => projectStatus(pbEmpB, acme.id))
  await denied('no status for a day that hasn’t come yet', () => projectStatus(pbEmpA, acme.id, '2099-01-01'))
  await allowed('the admin reads any client’s status', () => projectStatus(pbAdmin, north.id, '2026-10-01'))
  const teamLeave = (pb, client) => pb.send('/api/projects/leaves', { query: { client, from: '2026-10-01', to: '2026-10-31' } })
  let leaveRows = null
  await allowed('a member reads their client’s approved leave', async () => {
    leaveRows = await teamLeave(pbEmpA, acme.id)
  })
  check('only the client’s people, no leave type or reason', Array.isArray(leaveRows) && leaveRows.every((r) => [empA.id, mgrA.id].includes(r.user) && !('reason' in r) && !('leave_type' in r)))
  await denied('someone not on the client cannot read its leave', () => teamLeave(pbEmpB, acme.id))

  await allowed('the admin archives a client', () => pbAdmin.collection('clients').update(acme.id, { archived: true }))
  check('an archived client disappears for its people', (await pbEmpA.collection('clients').getFullList()).length === 0)
  check('and so does its calendar', (await pbEmpA.collection('project_events').getFullList()).length === 0)
  await denied('and its status', () => projectStatus(pbEmpA, acme.id))
  await allowed('the admin deletes a client', () => pbAdmin.collection('clients').delete(acme.id))
  check('its calendar goes with it', (await root.collection('project_events').getFullList({ filter: `client = "${acme.id}"` })).length === 0)
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
