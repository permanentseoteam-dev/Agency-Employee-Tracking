// Stores the project URL and service key in a project's Vault, for the hourly attendance job.
// Usage: node scripts/supabase-secrets.mjs staging|live   (reads .env.supabase; prints no secrets)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'

const target = (process.argv[2] ?? '').toUpperCase()
if (!['STAGING', 'LIVE'].includes(target)) throw new Error('Say which project: staging or live')
const env = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, '..', '.env.supabase'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=("?)(.*?)\2\s*(#.*)?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[3]])
)
const url = env[`${target}_URL`]
const ref = new URL(url).hostname.split('.')[0]
const sql = postgres({
  host: env[`${target}_DB_HOST`],
  port: 5432,
  database: 'postgres',
  username: `postgres.${ref}`,
  password: env[`${target}_DB_PASSWORD`],
  ssl: 'require',
  prepare: false
})
try {
  for (const [name, value] of [['project_url', url], ['service_role_key', env[`${target}_SERVICE_ROLE_KEY`]]]) {
    const [found] = await sql`select id from vault.secrets where name = ${name}`
    if (found) await sql`select vault.update_secret(${found.id}, ${value})`
    else await sql`select vault.create_secret(${value}, ${name})`
    console.log(`${target.toLowerCase()}: vault secret "${name}" ${found ? 'updated' : 'created'}`)
  }
} finally {
  await sql.end()
}
