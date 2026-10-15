// Copies a PocketBase database into a Supabase project (plan step 5; the switch-over is step 6).
//   node scripts/migrate-to-supabase.mjs --from <pb_data\data.db> --to staging [--reset]
//   node scripts/migrate-to-supabase.mjs --from <pb_data\data.db> --to live
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
if (!from || !['STAGING', 'LIVE'].includes(target)) {
  console.error('Usage: node scripts/migrate-to-supabase.mjs --from <pb_data\\data.db> --to staging|live [--reset]')
  process.exit(1)
}
if (reset && target !== 'STAGING') throw new Error('--reset is for staging only')
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
const DEFAULT_ROWS = ['org_settings', 'leave_types', 'star_rules']
const PROFILE_FIELDS = ['full_name', 'avatar', 'designation', 'phone', 'team', 'role', 'joined_on', 'left_on', 'active', 'must_change_password',
  'tracking_consent_at', 'pending_approval', 'created', 'updated']
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

const log = (m) => console.log(m)
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
  const rowsOf = (name) => (collections.has(name) ? pb.prepare(`select * from "${name}"`).all() : [])
  const users = rowsOf('users')
  log(`PocketBase copy: ${users.length} accounts, ${TABLES.filter((t) => collections.has(t)).length} tables (${from})`)

  // ---- the Supabase side must be empty ---------------------------------------------------------
  log(`Target: ${target.toLowerCase()} (${ref})`)
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
  const pbSeconds = new Map(
    pb.prepare(`select user, substr(started_at, 1, 10) day, state, round(sum((julianday(ended_at) - julianday(started_at)) * 86400)) s
                from activity_segments group by 1, 2, 3`).all().map((r) => [`${uuidOf.get(r.user)}|${r.day}|${r.state}`, Number(r.s)])
  )
  const sbSeconds = new Map(
    (await sql`select "user"::text u, to_char(started_at at time zone 'UTC', 'YYYY-MM-DD') d, state, round(sum(extract(epoch from ended_at - started_at)))::int s
               from activity_segments group by 1, 2, 3`).map((r) => [`${r.u}|${r.d}|${r.state}`, r.s])
  )
  const dayDiff = [...new Set([...pbSeconds.keys(), ...sbSeconds.keys()])].filter((k) => Math.abs((pbSeconds.get(k) ?? 0) - (sbSeconds.get(k) ?? 0)) > 1)
  check(`tracked time: ${pbSeconds.size} person-days match to the second`, dayDiff.length === 0, dayDiff.length ? `${dayDiff.length} differ` : '')

  const pbAtt = pb.prepare(`select coalesce(sum(active_s), 0) a, coalesce(sum(idle_s), 0) i, count(*) n from attendance`).get()
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
  const [days] = await sql`select count(*)::int n from org_settings where jsonb_typeof(work_days) <> 'array'`
  check('working days are a list', days.n === 0)
  const [notes] = await sql`select count(*)::int n from notifications n
    where jsonb_typeof(n.payload) <> 'object'
       or (n.payload ? 'requester' and not exists (select 1 from profiles p where p.id::text = n.payload->>'requester'))`
  check('notifications point at accounts that exist', notes.n === 0, notes.n ? `${notes.n} don't` : '')
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
