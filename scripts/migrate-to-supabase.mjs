// Copies a PocketBase database into a Supabase project (plan step 5; the switch-over is step 6).
//   node scripts/migrate-to-supabase.mjs --from <pb_data\data.db> --to staging [--reset]
//   node scripts/migrate-to-supabase.mjs --from <pb_data\data.db> --to live
//   node scripts/migrate-to-supabase.mjs --from <pb_data\data.db> --to live --delta
// - PocketBase is only read: data.db (with its -wal/-shm) is copied to a temp folder and the
//   copy is opened; profile pictures are read from <pb_data>\storage.
// - Accounts are made in Supabase Auth with their PocketBase bcrypt hashes, so everyone keeps
//   their password. Each gets a new uuid; every user field (user, manager, approver, given_by,
//   created_by, clients.members, notification payloads) is rewritten to it. All other ids stay.
// - The target must hold only its default rows. --reset (staging only) wipes staging first.
// - Tables are copied in one transaction with the guards off. If anything fails, the
//   transaction rolls back and the accounts made by this run are deleted again.
// - Afterwards it compares both sides: row counts, tracked seconds per person per day,
//   attendance and payroll totals, password hashes and pictures. It prints no names or emails.
// --delta (switch-over step 6.7, after the main copy): PCs that hadn't updated yet still send
//   tracked time to PocketBase. Accounts are matched by email: sign-ups since the copy are made,
//   a password changed since the copy comes along, other account changes (role, team, on/off)
//   are listed, never overwritten, and accounts deleted in Supabase are not made again. New
//   segments are added unless that person already has time recorded then; it can run again
//   safely. Anything else new in PocketBase is only listed, to be looked at by hand.
// Reads <TARGET>_URL, _SERVICE_ROLE_KEY, _DB_HOST, _DB_PASSWORD from .env.supabase.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const from = arg('--from')
const target = (arg('--to') ?? '').toUpperCase()
const reset = process.argv.includes('--reset')
const delta = process.argv.includes('--delta')
if (!from || !['STAGING', 'LIVE'].includes(target)) {
  console.error('Usage: node scripts/migrate-to-supabase.mjs --from <pb_data\\data.db> --to staging|live [--reset | --delta]')
  process.exit(1)
}
if (reset && target !== 'STAGING') throw new Error('--reset is for staging only')
if (reset && delta) throw new Error('--reset and --delta don’t go together')
if (!existsSync(from)) throw new Error(`${from} not found`)

const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, '..', '.env.supabase'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=("?)(.*?)\2\s*(#.*)?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[3]])
)
for (const k of ['URL', 'SERVICE_ROLE_KEY', 'DB_HOST', 'DB_PASSWORD']) {
  if (!env[`${target}_${k}`]) throw new Error(`${target}_${k} is missing in .env.supabase`)
}
if (target === 'STAGING' && env.LIVE_URL === env.STAGING_URL) throw new Error('STAGING_URL is the live project')
const url = env[`${target}_URL`]
const ref = new URL(url).hostname.split('.')[0]
const auth = createClient(url, env[`${target}_SERVICE_ROLE_KEY`], { auth: { persistSession: false, autoRefreshToken: false } })
const sql = postgres({
  host: env[`${target}_DB_HOST`],
  port: 5432,
  database: 'postgres',
  username: `postgres.${ref}`,
  password: env[`${target}_DB_PASSWORD`],
  ssl: 'require',
  prepare: false,
  onnotice: () => {}
})

// Copy order: what a row points at is copied before it. (users → profiles is done first.)
const TABLES = ['teams', 'salaries', 'org_settings', 'leave_types', 'star_rules', 'holidays', 'events', 'activity_segments', 'presence',
  'attendance', 'leave_requests', 'payroll_runs', 'payroll_items', 'notifications', 'star_records', 'clients', 'project_events']
// Rows the schema migration created; the PocketBase rows replace them.
// (DEFAULT_ROWS below.) The demo company (scripts/demo-data) is never copied: these tag it.
const DEMO_DOMAIN = '@demo.test'
const DEMO_TEAMS = ['Demo Alpha', 'Demo Bravo']
const DEFAULT_ROWS = ['org_settings', 'leave_types', 'star_rules']
const PROFILE_FIELDS = ['full_name', 'avatar', 'designation', 'phone', 'team', 'role', 'joined_on', 'left_on', 'active', 'must_change_password',
  'tracking_consent_at', 'pending_approval', 'created', 'updated']
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

const log = (m) => console.log(m)
/** --delta: what PocketBase got after the main copy (see the top of this file). */
async function deltaCopy({ collections, rowsOf, users }) {
  // When the main copy ran: the first account it made (every copied account keeps its old id).
  const [{ copiedAt }] = await sql`select min(u.created_at) as "copiedAt" from auth.users u join profiles p on p.id = u.id where p.legacy_id is not null`
  if (!copiedAt) throw new Error('the target has no copied accounts: run the main copy first (without --delta)')
  const cutoff = new Date(copiedAt).getTime()
  const pbTime = (v) => Date.parse(String(v ?? '').replace(' ', 'T'))
  const known = new Map(
    (await sql`select lower(e.email) email, p.id::text, p.role, p.team, p.active, p.pending_approval, u.encrypted_password
      from profile_emails e join profiles p on p.id = e.id join auth.users u on u.id = e.id`).map((r) => [r.email, r])
  )
  const teams = new Set((await sql`select id from teams`).map((r) => r.id))
  const uuidOf = new Map()
  let made = 0
  let passwords = 0
  let deleted = 0
  const differs = []
  for (const u of users) {
    const there = known.get(String(u.email).toLowerCase())
    if (there) {
      uuidOf.set(u.id, there.id)
      if (pbTime(u.updated) <= cutoff) continue // not changed in PocketBase since the copy
      // A password changed on an old app since the copy comes along, so it keeps working.
      if (u.password && u.password !== there.encrypted_password) {
        await sql`update auth.users set encrypted_password = ${u.password}, updated_at = now() where id = ${there.id}`
        await sql`update profiles set must_change_password = ${!!u.must_change_password} where id = ${there.id}`
        passwords++
      }
      // Anything else may also have been changed in the app since: list it, never overwrite it.
      const what = []
      if ((u.role || 'employee') !== there.role) what.push('role')
      if ((u.team || null) !== there.team) what.push('team')
      if (!!u.active !== there.active || !!u.pending_approval !== there.pending_approval) what.push('switched on/off or approval')
      if (what.length) differs.push(`${there.id} (${what.join(', ')})`)
      continue
    }
    // In PocketBase since before the copy but no longer in Supabase: deleted there on purpose.
    if (pbTime(u.created) <= cutoff) {
      deleted++
      continue
    }
    const { data, error } = await auth.auth.admin.createUser({
      email: u.email,
      password_hash: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name ?? '' },
      ...(!u.active || u.pending_approval ? { ban_duration: '876000h' } : {})
    })
    if (error) throw new Error(`new account: ${error.message}`)
    committed = true // accounts made here stay: segments below may point at them
    uuidOf.set(u.id, data.user.id)
    await sql`update profiles set full_name = ${u.full_name ?? ''}, phone = ${u.phone ?? ''}, designation = ${u.designation ?? ''},
      role = ${u.role || 'employee'}, team = ${teams.has(u.team) ? u.team : null}, joined_on = ${u.joined_on ?? ''}, left_on = ${u.left_on ?? ''},
      active = ${!!u.active}, pending_approval = ${!!u.pending_approval}, must_change_password = ${!!u.must_change_password},
      tracking_consent_at = ${u.tracking_consent_at || null}, legacy_id = ${u.id} where id = ${data.user.id}`
    made++
  }
  log(`  accounts: ${uuidOf.size - made} matched by email, ${made} new${passwords ? `, ${passwords} new password(s) carried over` : ''}${deleted ? `, ${deleted} deleted in Supabase left out` : ''}`)
  if (differs.length) log(`  changed in PocketBase since the copy, check by hand in Organization (account ids): ${differs.join('; ')}`)

  const segments = rowsOf('activity_segments').filter((r) => uuidOf.has(r.user))
  const result = await sql.begin(async (tx) => {
    await tx`create temp table incoming (id text, "user" uuid, state text, started_at timestamptz, ended_at timestamptz) on commit drop`
    const rows = segments.map((r) => ({ id: r.id, user: uuidOf.get(r.user), state: r.state, started_at: r.started_at, ended_at: r.ended_at }))
    for (let i = 0; i < rows.length; i += 1000) await tx`insert into incoming ${tx(rows.slice(i, i + 1000), 'id', 'user', 'state', 'started_at', 'ended_at')}`
    const [{ there }] = await tx`select count(*)::int there from incoming i where exists (select 1 from activity_segments s where s.id = i.id)`
    const [{ added }] = await tx`with ins as (
        insert into activity_segments (id, "user", state, started_at, ended_at)
        select i.id, i."user", i.state, i.started_at, i.ended_at from incoming i
        where not exists (select 1 from activity_segments s where s.id = i.id)
          and not exists (select 1 from activity_segments s where s."user" = i."user" and s.started_at < i.ended_at and s.ended_at > i.started_at)
        returning 1)
      select count(*)::int added from ins`
    return { there, added }
  })
  const skipped = segments.length - result.there - result.added
  log(`  tracked time: ${result.added} new segments added, ${result.there} already there${skipped ? `, ${skipped} skipped (that person already has time recorded then)` : ''}`)
  if (result.added) log('  attendance: the hourly job recounts the last 7 days; for older days use Attendance → Recompute')

  const newer = []
  // Attendance is recounted by the hourly job, presence is live and notifications are made by the server: not listed.
  for (const t of TABLES.filter((t) => !['activity_segments', 'presence', 'attendance', 'notifications'].includes(t) && collections.has(t))) {
    const ids = rowsOf(t).map((r) => r.id)
    if (!ids.length) continue
    const there = new Set((await sql.unsafe(`select id from public.${t}`)).map((r) => r.id))
    const missing = ids.filter((id) => !there.has(id)).length
    if (missing) newer.push(`${t} ${missing}`)
  }
  log(newer.length ? `  new in PocketBase, not copied (look at these by hand): ${newer.join(', ')}` : '  nothing else is new in PocketBase')
}

const tmp = mkdtempSync(join(tmpdir(), 'pseo-migrate-'))
const created = [] // Auth accounts made by this run, deleted again if the tables weren't copied
let committed = false
let pb = null // the PocketBase copy
let ok = true

try {
  // ---- the PocketBase side (a copy) ----------------------------------------------------------
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(from + suffix)) copyFileSync(from + suffix, join(tmp, basename(from) + suffix))
  pb = new DatabaseSync(join(tmp, basename(from)))
  if (pb.prepare('pragma integrity_check').get().integrity_check !== 'ok') throw new Error('the PocketBase copy failed its integrity check')
  const collections = new Map(pb.prepare(`select id, name, type, fields from _collections`).all().map((c) => [c.name, { ...c, fields: JSON.parse(c.fields) }]))
  const usersCol = collections.get('users')
  if (!usersCol) throw new Error('no users collection: is this a PSEO Tracker database?')
  const rawRows = (name) => (collections.has(name) ? pb.prepare(`select * from "${name}"`).all() : [])
  // Leave out the demo company: its accounts, its teams and every row that belongs to one of them
  // (a "user" or "team" field pointing there). Other references to a demo person are just emptied.
  const teamsCol = collections.get('teams')
  const demoIds = new Set(rawRows('users').filter((u) => String(u.email ?? '').toLowerCase().endsWith(DEMO_DOMAIN)).map((u) => u.id))
  const demoTeams = new Set(rawRows('teams').filter((t) => DEMO_TEAMS.includes(t.name)).map((t) => t.id))
  const keep = (name, row) => {
    if (name === 'users') return !demoIds.has(row.id)
    if (name === 'teams') return !demoTeams.has(row.id)
    for (const f of collections.get(name)?.fields ?? []) {
      if (f.type !== 'relation' || (f.maxSelect ?? 1) > 1) continue
      if (f.name === 'user' && f.collectionId === usersCol.id && demoIds.has(row[f.name])) return false
      if (f.name === 'team' && teamsCol && f.collectionId === teamsCol.id && demoTeams.has(row[f.name])) return false
    }
    if (name === 'notifications' && row.payload) {
      try {
        const payload = JSON.parse(row.payload)
        if (demoIds.has(payload.requester) || demoIds.has(payload.user)) return false
      } catch {}
    }
    return true
  }
  const kept = new Map()
  const rowsOf = (name) => {
    if (!kept.has(name)) kept.set(name, rawRows(name).filter((r) => keep(name, r)))
    return kept.get(name)
  }
  const users = rowsOf('users')
  if (demoIds.size || demoTeams.size) log(`  left out: the demo company (${demoIds.size} @demo.test accounts, ${demoTeams.size} demo teams, and their rows)`)
  log(`PocketBase copy: ${users.length} accounts, ${TABLES.filter((t) => collections.has(t)).length} tables (${from})`)

  // ---- the Supabase side must be empty ---------------------------------------------------------
  log(`Target: ${target.toLowerCase()} (${ref})`)
  if (delta) await deltaCopy({ collections, rowsOf, users })
  else {
    if (reset) {
      await sql.begin(async (tx) => {
        await tx`set local app.bypass_guards = 'on'`
        for (const t of [...TABLES].reverse()) if (!DEFAULT_ROWS.includes(t)) await tx.unsafe(`delete from public.${t}`)
        await tx`delete from public.profiles`
      })
      for (let page = 1; ; page++) {
        const { data, error } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 })
        if (error) throw new Error(`list accounts: ${error.message}`)
        for (const u of data.users) {
          const { data: files } = await auth.storage.from('avatars').list(u.id)
          if (files?.length) await auth.storage.from('avatars').remove(files.map((f) => `${u.id}/${f.name}`))
          await auth.auth.admin.deleteUser(u.id)
        }
        if (data.users.length < 1000 || page > 50) break
      }
      log('  --reset: staging wiped')
    }
    const [{ accounts }] = await sql`select count(*)::int accounts from auth.users`
    const busy = []
    for (const t of TABLES.filter((t) => !DEFAULT_ROWS.includes(t))) {
      const [{ n }] = await sql.unsafe(`select count(*)::int n from public.${t}`)
      if (n) busy.push(`${t} ${n}`)
    }
    if (accounts || busy.length) throw new Error(`the target is not empty (${accounts} accounts${busy.length ? ', ' + busy.join(', ') : ''})${target === 'STAGING' ? '; add --reset to wipe staging first' : ''}`)

    // ---- accounts --------------------------------------------------------------------------------
    const uuidOf = new Map()
    for (const u of users) {
      const { data, error } = await auth.auth.admin.createUser({
        email: u.email,
        password_hash: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name ?? '' },
        // Switched off or waiting for approval: can't sign in (the org functions lift this).
        ...(!u.active || u.pending_approval ? { ban_duration: '876000h' } : {})
      })
      if (error) throw new Error(`account ${created.length + 1} of ${users.length}: ${error.message}`)
      created.push(data.user.id)
      uuidOf.set(u.id, data.user.id)
    }
    log(`  accounts: ${created.length} made in Auth with their password hashes`)

    // ---- values -------------------------------------------------------------------------------
    const userRelation = (col, field) => {
      const f = collections.get(col)?.fields.find((x) => x.name === field)
      return f?.type === 'relation' && f.collectionId === usersCol.id
    }
    const mapUser = (id) => (id ? (uuidOf.get(id) ?? null) : null)
    /** Ids inside a notification payload that point at accounts. */
    const mapPayload = (p) => {
      if (!p || typeof p !== 'object') return p
      const out = { ...p }
      for (const k of ['user', 'requester', 'given_by', 'approver']) if (typeof out[k] === 'string' && uuidOf.has(out[k])) out[k] = uuidOf.get(out[k])
      return out
    }
    const columnsOf = async (table) =>
      sql`select column_name, data_type, udt_name, is_nullable = 'YES' as nullable from information_schema.columns
          where table_schema = 'public' and table_name = ${table} order by ordinal_position`
    /** One PocketBase value as the Postgres column wants it. */
    function convert(col, table, value, c) {
      if (userRelation(table, c.column_name)) {
        if (c.data_type === 'ARRAY') return `{${JSON.parse(value || '[]').map(mapUser).filter(Boolean).join(',')}}`
        return mapUser(value)
      }
      if (value === null || value === undefined) return null
      switch (c.data_type) {
        case 'boolean':
          return !!value
        case 'timestamp with time zone':
          return value === '' ? null : value
        case 'jsonb': {
          if (value === '') return null
          const parsed = typeof value === 'string' ? JSON.parse(value) : value
          return sql.json(table === 'notifications' && col === 'payload' ? mapPayload(parsed) : parsed)
        }
        case 'integer':
          return Math.round(Number(value) || 0)
        case 'numeric':
          return Number(value) || 0
        case 'ARRAY':
          return `{${JSON.parse(value || '[]').join(',')}}`
        default:
          return value === '' && c.nullable ? null : String(value)
      }
    }

    // ---- tables, in one transaction ----------------------------------------------------------------
    const counts = {}
    await sql.begin(async (tx) => {
      await tx`set local app.bypass_guards = 'on'`
      const profileCols = (await columnsOf('profiles')).filter((c) => PROFILE_FIELDS.includes(c.column_name))
      const teamOf = []
      for (const u of users) {
        const row = {}
        for (const c of profileCols) {
          if (c.column_name === 'team') teamOf.push([uuidOf.get(u.id), u.team || null])
          else row[c.column_name] = convert(c.column_name, 'users', u[c.column_name], c)
        }
        row.legacy_id = u.id // lets a PC's queued time from before the switch find its owner
        await tx`update public.profiles set ${tx(row)} where id = ${uuidOf.get(u.id)}`
      }
      counts.users = users.length

      for (const t of TABLES) {
        if (!collections.has(t)) continue
        const source = rowsOf(t)
        const cols = (await columnsOf(t)).filter((c) => source.length === 0 || c.column_name in source[0])
        const missing = collections.get(t).fields.map((f) => f.name).filter((n) => !cols.some((c) => c.column_name === n))
        if (missing.length && source.length) log(`  note: ${t} has PocketBase fields with no Supabase column, not copied: ${missing.join(', ')}`)
        if (DEFAULT_ROWS.includes(t)) await tx.unsafe(`delete from public.${t}`)
        const rows = source.map((r) => Object.fromEntries(cols.map((c) => [c.column_name, convert(c.column_name, t, r[c.column_name], c)])))
        const names = cols.map((c) => c.column_name)
        for (let i = 0; i < rows.length; i += 500) await tx`insert into ${tx(`public.${t}`)} ${tx(rows.slice(i, i + 500), names)}`
        counts[t] = rows.length
        if (t === 'teams') for (const [id, team] of teamOf) if (team) await tx`update public.profiles set team = ${team} where id = ${id}`
      }
    })
    committed = true
    log(`  tables: ${Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', ')}`)

    // ---- profile pictures --------------------------------------------------------------------------
    const storage = join(dirname(from), 'storage', usersCol.id)
    let pictures = 0
    const lostPictures = []
    for (const u of users.filter((x) => x.avatar)) {
      const file = join(storage, u.id, u.avatar)
      if (!existsSync(file)) {
        lostPictures.push(u.id)
        continue
      }
      const { error } = await auth.storage
        .from('avatars')
        .upload(`${uuidOf.get(u.id)}/${u.avatar}`, readFileSync(file), { contentType: MIME[extname(u.avatar).toLowerCase()] ?? 'application/octet-stream', upsert: true })
      if (error) throw new Error(`picture upload: ${error.message}`)
      pictures++
    }
    log(`  pictures: ${pictures} copied${lostPictures.length ? `, ${lostPictures.length} missing in PocketBase storage (left as is)` : ''}`)

    // ---- checks --------------------------------------------------------------------------------------
    log('Checks')
    const check = (name, good, detail = '') => {
      if (!good) ok = false
      log(`  ${good ? 'OK  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
    }
    for (const t of ['profiles', ...TABLES]) {
      const want = t === 'profiles' ? users.length : rowsOf(t).length
      const [{ n }] = await sql.unsafe(`select count(*)::int n from public.${t}`)
      check(`${t}: ${n} rows`, n === want, n === want ? '' : `PocketBase has ${want}`)
    }
    const hashes = new Map((await sql`select id::text, encrypted_password from auth.users`).map((r) => [r.id, r.encrypted_password]))
    const sameHash = users.filter((u) => hashes.get(uuidOf.get(u.id)) === u.password).length
    check(`password hashes: ${sameHash} of ${users.length} identical`, sameHash === users.length)
    const banned = (await sql`select count(*)::int n from auth.users where banned_until > now()`)[0].n
    const wantBanned = users.filter((u) => !u.active || u.pending_approval).length
    check(`switched-off and waiting accounts can't sign in: ${banned}`, banned === wantBanned, banned === wantBanned ? '' : `expected ${wantBanned}`)

    // Tracked seconds per person per UTC day, both sides.
    const pbSeconds = new Map()
    for (const r of rowsOf('activity_segments')) {
      const key = `${uuidOf.get(r.user)}|${String(r.started_at).slice(0, 10)}|${r.state}`
      const seconds = (Date.parse(String(r.ended_at).replace(' ', 'T')) - Date.parse(String(r.started_at).replace(' ', 'T'))) / 1000
      pbSeconds.set(key, (pbSeconds.get(key) ?? 0) + seconds)
    }
    for (const [k, v] of pbSeconds) pbSeconds.set(k, Math.round(v))
    const sbSeconds = new Map(
      (await sql`select "user"::text u, to_char(started_at at time zone 'UTC', 'YYYY-MM-DD') d, state, round(sum(extract(epoch from ended_at - started_at)))::int s
                 from activity_segments group by 1, 2, 3`).map((r) => [`${r.u}|${r.d}|${r.state}`, r.s])
    )
    const dayDiff = [...new Set([...pbSeconds.keys(), ...sbSeconds.keys()])].filter((k) => Math.abs((pbSeconds.get(k) ?? 0) - (sbSeconds.get(k) ?? 0)) > 1)
    check(`tracked time: ${pbSeconds.size} person-days match to the second`, dayDiff.length === 0, dayDiff.length ? `${dayDiff.length} differ` : '')

    const pbAtt = rowsOf('attendance').reduce((t, r) => ({ a: t.a + Number(r.active_s || 0), i: t.i + Number(r.idle_s || 0) }), { a: 0, i: 0 })
    const [sbAtt] = await sql`select coalesce(sum(active_s), 0)::bigint a, coalesce(sum(idle_s), 0)::bigint i from attendance`
    check(`attendance totals: ${Number(sbAtt.a)} s active, ${Number(sbAtt.i)} s idle`, Number(sbAtt.a) === Number(pbAtt.a) && Number(sbAtt.i) === Number(pbAtt.i))
    const pbNet = rowsOf('payroll_items').reduce((s, r) => s + Number(r.net), 0)
    const [sbNet] = await sql`select coalesce(sum(net), 0)::numeric n from payroll_items`
    check(`payroll net total: PKR ${Number(sbNet.n)}`, Number(sbNet.n) === pbNet)
    const pbLeave = rowsOf('leave_requests').reduce((s, r) => s + Number(r.days), 0)
    const [sbLeave] = await sql`select coalesce(sum(days), 0)::numeric n from leave_requests`
    check(`leave days total: ${Number(sbLeave.n)}`, Number(sbLeave.n) === pbLeave)
    const orphans = (await sql`select count(*)::int n from profiles p left join teams t on t.id = p.team where p.team is not null and t.id is null`)[0].n
    check('every team on a profile exists', orphans === 0)
    const legacy = new Map((await sql`select id::text, legacy_id from profiles`).map((r) => [r.id, r.legacy_id]))
    const withOldId = users.filter((u) => legacy.get(uuidOf.get(u.id)) === u.id).length
    check(`old PocketBase ids kept on ${withOldId} of ${users.length} profiles`, withOldId === users.length)
    const [days] = await sql`select count(*)::int n from org_settings where jsonb_typeof(work_days) <> 'array'`
    check('working days are a list', days.n === 0)
    const [notes] = await sql`select count(*)::int n from notifications n
      where jsonb_typeof(n.payload) <> 'object'
         or (n.payload ? 'requester' and not exists (select 1 from profiles p where p.id::text = n.payload->>'requester'))`
    check('notifications point at accounts that exist', notes.n === 0, notes.n ? `${notes.n} don't` : '')
  }
} catch (err) {
  ok = false
  console.error(`\nMigration failed: ${err.message}`)
  if (created.length && !committed) {
    console.error(`Deleting the ${created.length} accounts this run made…`)
    for (const id of created) await auth.auth.admin.deleteUser(id).catch(() => {})
  } else if (committed) {
    console.error(target === 'STAGING' ? 'The tables were copied; run again with --reset.' : 'The tables were copied: check the failure above before anything else.')
  }
} finally {
  pb?.close()
  await sql.end()
  rmSync(tmp, { recursive: true, force: true })
}
console.log(ok ? '\nDone: everything matches.' : '\nNot everything matches: see above.')
process.exit(ok ? 0 : 1)
