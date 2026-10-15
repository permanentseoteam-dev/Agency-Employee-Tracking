// Demo data: a small make-believe company inside a real PocketBase, so every role has
// something to look at. Everything it makes is tagged and can be removed again:
//   - emails end in @demo.test, names end in "(demo)", teams are "Demo Alpha" / "Demo Bravo"
//   - 7 people: a demo admin, 2 demo managers (one per demo team), 4 demo employees
//   - from the 1st of last month to yesterday: tracked time (5-minute segments like the
//     tracker's), attendance worked out with the server's own rules, leave in every
//     state, salaries, and an excused star
// Nothing company-wide is touched: no holidays, events, leave types, rules or payroll.
//
// Usage (every argument is required, so it never guesses which server to change):
//   node scripts/demo-data/index.mjs add    --url http://127.0.0.1:8090 --exe <pocketbase.exe> --dir <pb_data> [--out <file>]
//   node scripts/demo-data/index.mjs remove --url http://127.0.0.1:8090 --exe <pocketbase.exe> --dir <pb_data> [--out <file>]
// It signs in with a temporary dashboard superuser made with the CLI (removed at the end),
// takes a backup first (POST /api/backups), and writes the demo password to --out
// (default: next to the pb_data folder, demo-accounts.txt). No password is in this file.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import PocketBase from 'pocketbase'

const require = createRequire(import.meta.url)
const att = require('../../server/pb_hooks/lib/attendance.js')

export const DEMO_DOMAIN = '@demo.test'
export const DEMO_TEAMS = ['Demo Alpha', 'Demo Bravo']
const DAY = 86400000
const MIN = 60000

const PEOPLE = [
  { key: 'admin', role: 'admin', name: 'Hamza Admin (demo)', designation: 'Operations head', salary: 240000, lateDays: 1 },
  { key: 'hira', role: 'manager', name: 'Hira Manager (demo)', team: 'Demo Alpha', manages: 'Demo Alpha', designation: 'SEO lead', salary: 160000, lateDays: 2 },
  { key: 'omar', role: 'manager', name: 'Omar Manager (demo)', team: 'Demo Bravo', manages: 'Demo Bravo', designation: 'Content lead', salary: 150000, lateDays: 3 },
  { key: 'ali', role: 'employee', name: 'Ali Raza (demo)', team: 'Demo Alpha', designation: 'Link builder', salary: 70000, lateDays: 6 },
  { key: 'sara', role: 'employee', name: 'Sara Iqbal (demo)', team: 'Demo Alpha', designation: 'Frontend developer', salary: 95000, lateDays: 2 },
  { key: 'usman', role: 'employee', name: 'Usman Tariq (demo)', team: 'Demo Bravo', designation: 'Content writer', salary: 65000, lateDays: 4 },
  { key: 'zainab', role: 'employee', name: 'Zainab Noor (demo)', team: 'Demo Bravo', designation: 'Designer', salary: 80000, lateDays: 1 }
]

// ---- small helpers ------------------------------------------------------------

function args() {
  const [command, ...rest] = process.argv.slice(2)
  const out = { command }
  for (let i = 0; i < rest.length; i += 2) out[rest[i].replace(/^--/, '')] = rest[i + 1]
  return out
}

/** A repeatable random number generator, so a person's month looks the same on every run. */
function rng(seedText) {
  let seed = 0
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Runs `fn` over the items, `limit` at a time. */
async function pool(items, limit, fn) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
}

/** A temporary dashboard superuser made with the CLI, like create-first-admin.ps1. */
async function superuser(opts) {
  const email = `demo-data-${randomBytes(4).toString('hex')}@local.test`
  const password = randomBytes(18).toString('base64url')
  execFileSync(opts.exe, ['superuser', 'upsert', email, password, '--dir', opts.dir], { stdio: 'ignore' })
  const pb = new PocketBase(opts.url)
  pb.autoCancellation(false)
  await pb.collection('_superusers').authWithPassword(email, password)
  const done = () => {
    try {
      execFileSync(opts.exe, ['superuser', 'delete', email, '--dir', opts.dir], { stdio: 'ignore' })
    } catch {
      console.log(`  ! could not delete the temporary superuser ${email}; delete it in the dashboard`)
    }
  }
  return { pb, done }
}

async function backup(pb, label) {
  const name = `${label}-${stamp()}.zip`
  await pb.backups.create(name)
  console.log(`  backup: ${name} (pb_data\\backups)`)
}

async function demoUsers(pb) {
  return (await pb.collection('users').getFullList({ filter: pb.filter('email ~ {:d}', { d: DEMO_DOMAIN }) })).filter((u) =>
    u.email.endsWith(DEMO_DOMAIN)
  )
}

// ---- one person-day of tracked time ---------------------------------------------

/**
 * 5-minute segments from `start` (minutes after midnight, org time) until `activeMin`
 * active minutes are done: a short idle break about every hour and a lunch gap at 13:00.
 */
function daySegments(userId, day, offsetMin, start, activeMin, rand) {
  const out = []
  let t = start
  let active = 0
  let sinceBreak = 0
  let lunch = false
  const at = (m) => new Date(Date.parse(day + 'T00:00:00.000Z') + (m - offsetMin) * MIN).toISOString()
  const push = (state) => {
    out.push({ user: userId, state, started_at: at(t), ended_at: at(t + 5) })
    t += 5
  }
  while (active < activeMin) {
    if (!lunch && t >= 13 * 60) {
      t += between(rand, 35, 50) // lunch: nothing recorded
      lunch = true
      sinceBreak = 0
      continue
    }
    if (sinceBreak >= between(rand, 50, 70)) {
      const breaks = between(rand, 1, 2)
      for (let i = 0; i < breaks; i++) push('idle')
      sinceBreak = 0
      continue
    }
    push('active')
    active += 5
    sinceBreak += 5
  }
  return out
}

// ---- add ---------------------------------------------------------------------------

async function add(opts) {
  const { pb, done } = await superuser(opts)
  try {
    if ((await demoUsers(pb)).length) {
      throw new Error(`Demo data is already there (${DEMO_DOMAIN} accounts exist). Run "remove" first.`)
    }
    await backup(pb, 'before-demo')

    const settings = (await pb.collection('org_settings').getFullList())[0]
    const workDays = Array.isArray(settings.work_days) ? settings.work_days : JSON.parse(settings.work_days || '[]')
    const rules = { ...settings, work_days: workDays }
    const tz = settings.timezone || 'Asia/Karachi'
    const offset = att.offsetFor(tz)
    const today = att.todayKey(offset, Date.now())
    const yesterday = att.addDays(today, -1)
    const lastMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10)
    const from = lastMonth
    const holidays = (await pb.collection('holidays').getFullList()).map((h) => h.date)
    const isWorking = (d) => workDays.includes(att.isoWeekday(d)) && !holidays.includes(d)
    const days = att.daysBetween(from, yesterday)
    const workingDays = days.filter(isWorking)
    const future = att.daysBetween(today, att.addDays(today, 21)).filter(isWorking).slice(1)
    console.log(`  period: ${from} – ${yesterday} (${workingDays.length} working days)`)

    const types = await pb.collection('leave_types').getFullList({ sort: 'name' })
    const paid = types.filter((t) => t.paid)
    const typeFor = (i) => (paid.length ? paid[i % paid.length] : types[i % types.length])
    if (!types.length) throw new Error('There are no leave types.')

    // People and teams.
    const password = `Demo-${randomBytes(6).toString('base64url')}`
    const ids = {}
    const teams = {}
    for (const name of DEMO_TEAMS) teams[name] = await pb.collection('teams').create({ name })
    for (const p of PEOPLE) {
      const u = await pb.collection('users').create({
        email: `${p.key}${DEMO_DOMAIN}`,
        password,
        passwordConfirm: password,
        full_name: p.name,
        role: p.role,
        designation: p.designation,
        team: p.team ? teams[p.team].id : '',
        joined_on: from,
        active: true,
        verified: true,
        must_change_password: false,
        pending_approval: false,
        tracking_consent_at: new Date().toISOString()
      })
      ids[p.key] = u.id
      if (p.manages) await pb.collection('teams').update(teams[p.manages].id, { manager: u.id })
      const salary = await pb.collection('salaries').getFirstListItem(pb.filter('user = {:u}', { u: u.id })).catch(() => null)
      if (salary) await pb.collection('salaries').update(salary.id, { monthly_salary_pkr: p.salary })
      else await pb.collection('salaries').create({ user: u.id, monthly_salary_pkr: p.salary })
    }
    console.log(`  people: ${PEOPLE.length} (teams ${DEMO_TEAMS.join(', ')})`)

    // Leave: who decides for whom (demo managers for their teams, the demo admin for managers).
    const deciderOf = (p) => (p.role === 'employee' ? ids[PEOPLE.find((m) => m.manages === p.team).key] : ids.admin)
    const leaves = {}
    let leaveCount = 0
    for (const [i, p] of PEOPLE.entries()) {
      const rand = rng(p.key + ':leave')
      const pick = (list, lo, hi) => list[between(rand, lo, hi)]
      const firstHalf = workingDays.filter((d) => d < `${today.slice(0, 7)}-01`)
      const secondHalf = workingDays.filter((d) => d >= `${today.slice(0, 7)}-01`)
      const plan = []
      const start1 = pick(firstHalf, 2, firstHalf.length - 4)
      const next1 = workingDays[workingDays.indexOf(start1) + 1]
      plan.push({ start_date: start1, end_date: p.role === 'employee' ? next1 : start1, status: 'approved', reason: 'Family wedding' })
      if (p.role !== 'admin') {
        const halfDay = pick(secondHalf.length > 2 ? secondHalf : firstHalf, 0, Math.max(0, (secondHalf.length > 2 ? secondHalf : firstHalf).length - 2))
        if (halfDay !== start1 && halfDay !== next1) plan.push({ start_date: halfDay, end_date: halfDay, half_day: true, status: 'approved', reason: 'Doctor’s appointment' })
        const rejected = future[between(rand, 2, 5)]
        plan.push({ start_date: rejected, end_date: rejected, status: 'rejected', reason: 'Personal work', comment: 'Busy week for the team, please pick another day.' })
        const cancelled = future[between(rand, 6, 9)]
        plan.push({ start_date: cancelled, end_date: cancelled, status: 'cancelled', reason: 'Plans changed' })
      }
      if (p.role === 'employee') {
        const pending = future[between(rand, 10, 12)]
        plan.push({ start_date: pending, end_date: pending, status: 'pending', reason: 'Visiting family' })
      }
      leaves[p.key] = []
      for (const [j, l] of plan.entries()) {
        const decided = l.status === 'approved' || l.status === 'rejected'
        const rec = await pb.collection('leave_requests').create({
          user: ids[p.key],
          leave_type: typeFor(i + j).id,
          half_day: false,
          comment: '',
          ...l,
          approver: decided ? deciderOf(p) : '',
          decided_at: decided ? new Date().toISOString() : ''
        })
        leaves[p.key].push(rec)
        leaveCount++
      }
    }
    console.log(`  leave requests: ${leaveCount} (approved, half day, rejected, cancelled, pending)`)

    // Tracked time.
    const shiftStart = minutesOf(settings.shift_start || '09:00')
    const grace = Number(settings.grace_minutes) || 0
    const fullHours = Number(settings.full_day_min_hours) || 8
    const halfHours = Number(settings.half_day_min_hours) || 4
    const segments = []
    const segsByPersonDay = {}
    for (const p of PEOPLE) {
      const rand = rng(p.key + ':time')
      const approved = leaves[p.key].filter((l) => l.status === 'approved')
      const onLeave = (d) => approved.some((l) => l.start_date <= d && l.end_date >= d)
      const usable = workingDays.filter((d) => !onLeave(d))
      // A few days that show the other statuses: one absence, two short days, some late starts.
      const shuffled = [...usable].sort(() => rand() - 0.5)
      const absent = new Set(shuffled.slice(0, 1))
      const short = new Set(shuffled.slice(1, 3))
      const late = new Set(shuffled.slice(3, 3 + p.lateDays))
      for (const d of usable) {
        if (absent.has(d)) continue
        let start
        let activeMin
        if (short.has(d)) {
          start = shiftStart + between(rand, -10, grace - 2)
          activeMin = Math.max(30, Math.round(halfHours * 60) - between(rand, 40, 90))
        } else {
          start = late.has(d) ? shiftStart + grace + between(rand, 8, 55) : shiftStart + between(rand, -15, Math.max(0, grace - 2))
          activeMin = Math.round(fullHours * 60) + between(rand, 10, 60)
        }
        const daySegs = daySegments(ids[p.key], d, offset, start, Math.round(activeMin / 5) * 5, rand)
        segsByPersonDay[`${p.key}|${d}`] = daySegs
        segments.push(...daySegs)
      }
    }
    let written = 0
    await pool(segments, 8, async (s) => {
      await pb.collection('activity_segments').create(s)
      written++
      if (written % 2000 === 0) console.log(`  … ${written} / ${segments.length} segments`)
    })
    console.log(`  tracked time: ${segments.length} segments`)

    // Attendance, with the server's own rules; only the demo people's records are written.
    const existing = {}
    for (const r of await pb.collection('attendance').getFullList({ filter: pb.filter('user.email ~ {:d}', { d: DEMO_DOMAIN }) })) {
      existing[`${r.user}|${r.date}`] = r.id
    }
    const records = []
    for (const p of PEOPLE) {
      const approved = leaves[p.key].filter((l) => l.status === 'approved')
      for (const d of days) {
        const r = att.statusFor(d, rules, segsByPersonDay[`${p.key}|${d}`] || [], approved, holidays)
        records.push({ key: `${ids[p.key]}|${d}`, data: { user: ids[p.key], ...r, date: d } })
      }
    }
    await pool(records, 8, async ({ key, data }) => {
      if (existing[key]) await pb.collection('attendance').update(existing[key], data)
      else await pb.collection('attendance').create(data)
    })
    const counts = {}
    for (const r of records) counts[r.data.status] = (counts[r.data.status] ?? 0) + 1
    console.log(`  attendance: ${records.length} days (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})`)

    // Stars: one late day excused by the demo admin (only where stars exist on this server).
    const lateRule = await pb.collection('star_rules').getFirstListItem('auto = "late"').catch(() => null)
    const aLate = records.find((r) => r.data.user === ids.ali && r.data.status === 'late')
    if (lateRule && aLate) {
      await pb.collection('star_records').create({ user: ids.ali, rule: lateRule.id, date: aLate.data.date, excused: true, note: 'Traffic jam on the motorway', given_by: ids.admin })
      console.log('  stars: one late day excused (Ali)')
    }

    const lines = [
      'PSEO Tracker demo accounts (made by scripts/demo-data). Remove them with the "remove" command.',
      `Made: ${new Date().toISOString()}  Server: ${opts.url}`,
      '',
      `Password for every demo account: ${password}`,
      '',
      ...PEOPLE.map((p) => `${(p.key + DEMO_DOMAIN).padEnd(22)} ${p.role.padEnd(9)} ${p.name}${p.team ? ` · ${p.team}` : ''}`),
      '',
      'Do not finalize a payroll month while demo people are in it: a finalized month can never be deleted.'
    ]
    writeFileSync(opts.out, lines.join('\r\n') + '\r\n')
    console.log(`\n  Done. Demo logins (password in ${opts.out}):`)
    for (const p of PEOPLE) console.log(`    ${(p.key + DEMO_DOMAIN).padEnd(22)} ${p.role}`)
  } finally {
    done()
  }
}

// ---- remove ------------------------------------------------------------------------

async function remove(opts) {
  const { pb, done } = await superuser(opts)
  try {
    const users = await demoUsers(pb)
    const teams = (await pb.collection('teams').getFullList()).filter((t) => DEMO_TEAMS.includes(t.name))
    if (!users.length && !teams.length) {
      console.log('  No demo data here.')
      return
    }
    const ids = new Set(users.map((u) => u.id))
    const lines = (await pb.collection('payroll_items').getFullList({ expand: 'run' })).filter((i) => ids.has(i.user))
    const finalized = lines.filter((i) => i.expand?.run?.status === 'finalized')
    if (finalized.length) {
      const months = [...new Set(finalized.map((i) => i.expand.run.month))].join(', ')
      throw new Error(`Demo people are in finalized payroll (${months}), which can't be changed. Nothing was removed.`)
    }
    await backup(pb, 'before-demo-remove')
    for (const i of lines) await pb.collection('payroll_items').delete(i.id)
    // Deleting a person also deletes their time, attendance, leave, salary, notifications and stars.
    for (const u of users) await pb.collection('users').delete(u.id)
    for (const t of teams) await pb.collection('teams').delete(t.id)
    if (existsSync(opts.out)) rmSync(opts.out)
    console.log(`  Removed ${users.length} demo people, ${teams.length} demo teams${lines.length ? ` and ${lines.length} draft payroll lines` : ''}.`)
  } finally {
    done()
  }
}

// ---- main --------------------------------------------------------------------------

const opts = args()
if (!['add', 'remove'].includes(opts.command) || !opts.url || !opts.exe || !opts.dir) {
  console.log('Usage: node scripts/demo-data/index.mjs add|remove --url <server> --exe <pocketbase.exe> --dir <pb_data> [--out <file>]')
  process.exit(2)
}
opts.dir = resolve(opts.dir)
opts.out = resolve(opts.out || join(dirname(opts.dir), 'demo-accounts.txt'))
if (!existsSync(opts.exe) || !existsSync(opts.dir)) {
  console.log('The pocketbase.exe or pb_data folder given does not exist.')
  process.exit(2)
}
console.log(`${opts.command === 'add' ? 'Adding' : 'Removing'} demo data on ${opts.url} (${opts.dir})`)
try {
  await (opts.command === 'add' ? add(opts) : remove(opts))
} catch (err) {
  console.error(`\n  Stopped: ${err?.response?.message ?? err?.message ?? err}`, err?.response?.data ? JSON.stringify(err.response.data) : '')
  process.exitCode = 1
}
