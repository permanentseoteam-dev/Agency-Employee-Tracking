// Restores a backup made by scripts/backup-supabase.mjs into a Supabase project.
//   node scripts/restore-supabase.mjs <backup folder> --to staging|live [--reset] [--pg-bin <folder>]
// The project must already have the schema (supabase db push of supabase/migrations) and hold
// only its default rows; --reset (staging only) wipes staging first, accounts included.
// Everything goes in one transaction with triggers off (the backup already has the profiles the
// account trigger would make), so a failure leaves the project as it was. Then the pictures are
// uploaded and the row counts printed.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : fallback
}
const folder = process.argv[2]
const target = (arg('--to', '') ?? '').toUpperCase()
const reset = process.argv.includes('--reset')
const pgBin = arg('--pg-bin', join(process.env.LOCALAPPDATA ?? '', 'PSEO Tracker Tools', 'pgsql', 'bin'))
if (!folder || !['STAGING', 'LIVE'].includes(target)) {
  console.error('Usage: node scripts/restore-supabase.mjs <backup folder> --to staging|live [--reset] [--pg-bin <folder>]')
  process.exit(1)
}
if (reset && target !== 'STAGING') throw new Error('--reset is for staging only')
const dump = join(folder, 'data.dump')
if (!existsSync(dump)) throw new Error(`${dump} not found`)
for (const exe of ['pg_restore.exe', 'psql.exe']) if (!existsSync(join(pgBin, exe))) throw new Error(`${exe} not found in ${pgBin} (use --pg-bin)`)

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
const ref = new URL(env[`${target}_URL`]).hostname.split('.')[0]
const pgEnv = { ...process.env, PGHOST: env[`${target}_DB_HOST`], PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: `postgres.${ref}`,
  PGPASSWORD: env[`${target}_DB_PASSWORD`], PGSSLMODE: 'require' }
const admin = createClient(env[`${target}_URL`], env[`${target}_SERVICE_ROLE_KEY`], { auth: { persistSession: false, autoRefreshToken: false } })
const sql = postgres({ host: pgEnv.PGHOST, port: 5432, database: 'postgres', username: pgEnv.PGUSER, password: pgEnv.PGPASSWORD, ssl: 'require', prepare: false, onnotice: () => {} })
const DATA_TABLES = ['star_records', 'notifications', 'project_events', 'clients', 'payroll_items', 'payroll_runs', 'attendance', 'activity_segments',
  'presence', 'leave_requests', 'salaries', 'events', 'holidays', 'teams']
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }
const tmp = mkdtempSync(join(tmpdir(), 'pseo-restore-'))

try {
  console.log(`Restoring ${folder} into ${target.toLowerCase()} (${ref})`)
  if (reset) {
    await sql.begin(async (tx) => {
      await tx`set local app.bypass_guards = 'on'`
      for (const t of DATA_TABLES) await tx.unsafe(`delete from public.${t}`)
      await tx`delete from public.profiles`
    })
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (error) throw new Error(`list accounts: ${error.message}`)
      if (!data.users.length) break
      for (const u of data.users) {
        const { data: files } = await admin.storage.from('avatars').list(u.id)
        if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${u.id}/${f.name}`))
        await admin.auth.admin.deleteUser(u.id)
      }
    }
    console.log('  --reset: staging wiped')
  }
  const [{ n: accounts }] = await sql`select count(*)::int n from auth.users`
  const busy = []
  for (const t of DATA_TABLES) {
    const [{ n }] = await sql.unsafe(`select count(*)::int n from public.${t}`)
    if (n) busy.push(`${t} ${n}`)
  }
  if (accounts || busy.length) throw new Error(`the project is not empty (${accounts} accounts${busy.length ? ', ' + busy.join(', ') : ''})`)

  // The backup's rows replace the defaults the schema migration made.
  const script = join(tmp, 'restore.sql')
  execFileSync(join(pgBin, 'pg_restore.exe'), ['--data-only', '--no-owner', '--no-privileges', `--file=${script}`, dump], { stdio: ['ignore', 'ignore', 'pipe'] })
  execFileSync(
    join(pgBin, 'psql.exe'),
    ['--no-psqlrc', '--quiet', '--single-transaction', '--set=ON_ERROR_STOP=1',
      '--command=set session_replication_role = replica',
      '--command=delete from public.org_settings; delete from public.leave_types; delete from public.star_rules; delete from public.register_attempts',
      `--file=${script}`],
    { env: pgEnv, stdio: ['ignore', 'ignore', 'pipe'] }
  )
  console.log('  data and accounts restored')

  let pictures = 0
  const avatars = join(folder, 'avatars')
  for (const owner of existsSync(avatars) ? readdirSync(avatars) : []) {
    for (const name of readdirSync(join(avatars, owner))) {
      const { error } = await admin.storage
        .from('avatars')
        .upload(`${owner}/${name}`, readFileSync(join(avatars, owner, name)), { contentType: MIME[extname(name).toLowerCase()] ?? 'application/octet-stream', upsert: true })
      if (error) throw new Error(`picture upload: ${error.message}`)
      pictures++
    }
  }
  console.log(`  pictures: ${pictures}`)

  const counts = []
  for (const t of ['profiles', ...DATA_TABLES.slice().reverse(), 'org_settings', 'leave_types', 'star_rules']) {
    const [{ n }] = await sql.unsafe(`select count(*)::int n from public.${t}`)
    counts.push(`${t} ${n}`)
  }
  const [{ n: restored }] = await sql`select count(*)::int n from auth.users`
  console.log(`  accounts ${restored}; ${counts.join(', ')}`)
  console.log('\nDone.')
} catch (err) {
  const detail = err.stderr ? String(err.stderr).trim().split('\n').slice(-3).join(' | ') : err.message
  console.error(`\nRestore failed: ${detail}`)
  process.exitCode = 1
} finally {
  await sql.end()
  rmSync(tmp, { recursive: true, force: true })
}
