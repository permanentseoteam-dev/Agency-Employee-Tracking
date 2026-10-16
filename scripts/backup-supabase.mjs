// Nightly backup of a Supabase project (plan step 7: the free plan has no backups of its own).
//   node scripts/backup-supabase.mjs live|staging [--out <folder>] [--keep <days>] [--pg-bin <folder>]
// Writes <out>\<target>-<YYYYMMDD-HHmm>\ with:
//   data.dump   every table in public plus the accounts (auth.users, auth.identities, so
//               passwords survive), data only: the schema is in supabase/migrations
//   avatars\    the profile pictures
// Folders older than --keep days (default 14) are deleted. Running it also keeps a free
// project from pausing. Restore with scripts/restore-supabase.mjs.
// Needs pg_dump 17 (portable, no install): --pg-bin, or %LOCALAPPDATA%\PSEO Tracker Tools\pgsql\bin.
// Reads <TARGET>_URL, _SERVICE_ROLE_KEY, _DB_HOST, _DB_PASSWORD from .env.supabase.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : fallback
}
const target = (process.argv[2] ?? '').toUpperCase()
if (!['STAGING', 'LIVE'].includes(target)) {
  console.error('Usage: node scripts/backup-supabase.mjs live|staging [--out <folder>] [--keep <days>] [--pg-bin <folder>]')
  process.exit(1)
}
const out = arg('--out', 'E:\\PSEOTrackerBackups\\supabase')
const keepDays = Number(arg('--keep', '14'))
const pgBin = arg('--pg-bin', join(process.env.LOCALAPPDATA ?? '', 'PSEO Tracker Tools', 'pgsql', 'bin'))

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
const pgDump = join(pgBin, 'pg_dump.exe')
if (!existsSync(pgDump)) throw new Error(`pg_dump not found in ${pgBin} (use --pg-bin)`)

mkdirSync(out, { recursive: true })
const logFile = join(out, 'backup.log')
const log = (m) => {
  const line = `${new Date().toISOString()} ${target.toLowerCase()} ${m}`
  console.log(line)
  appendFileSync(logFile, line + '\n')
}
const stamp = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-') // Karachi time
const folder = join(out, `${target.toLowerCase()}-${stamp}`)

try {
  mkdirSync(join(folder, 'avatars'), { recursive: true })
  execFileSync(
    pgDump,
    ['--format=custom', '--data-only', '--no-owner', '--no-privileges', '--table=public.*', '--table=auth.users', '--table=auth.identities',
      `--file=${join(folder, 'data.dump')}`],
    {
      env: { ...process.env, PGHOST: env[`${target}_DB_HOST`], PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: `postgres.${ref}`,
        PGPASSWORD: env[`${target}_DB_PASSWORD`], PGSSLMODE: 'require' },
      stdio: ['ignore', 'ignore', 'pipe']
    }
  )

  const storage = createClient(env[`${target}_URL`], env[`${target}_SERVICE_ROLE_KEY`], { auth: { persistSession: false } }).storage.from('avatars')
  let pictures = 0
  const { data: owners, error } = await storage.list('', { limit: 10000 })
  if (error) throw new Error(`list pictures: ${error.message}`)
  for (const owner of owners ?? []) {
    const { data: files } = await storage.list(owner.name, { limit: 100 })
    for (const f of files ?? []) {
      const { data: blob, error: dlError } = await storage.download(`${owner.name}/${f.name}`)
      if (dlError) throw new Error(`download picture: ${dlError.message}`)
      mkdirSync(join(folder, 'avatars', owner.name), { recursive: true })
      writeFileSync(join(folder, 'avatars', owner.name, f.name), Buffer.from(await blob.arrayBuffer()))
      pictures++
    }
  }

  const size = statSync(join(folder, 'data.dump')).size
  log(`backup ${folder}: data ${(size / 1024 / 1024).toFixed(1)} MB, ${pictures} pictures`)

  // Keep the last --keep days.
  const cutoff = Date.now() - keepDays * 86400000
  for (const name of readdirSync(out)) {
    const path = join(out, name)
    if (!name.startsWith(`${target.toLowerCase()}-`) || path === folder || !statSync(path).isDirectory()) continue
    if (statSync(path).mtimeMs < cutoff) {
      rmSync(path, { recursive: true, force: true })
      log(`deleted the old backup ${name}`)
    }
  }
} catch (err) {
  const detail = err.stderr ? String(err.stderr).trim().split('\n').pop() : err.message
  log(`BACKUP FAILED: ${detail}`)
  rmSync(folder, { recursive: true, force: true })
  process.exit(1)
}
