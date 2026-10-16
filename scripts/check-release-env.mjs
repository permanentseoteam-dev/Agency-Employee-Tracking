// Stops a release build that would point staff at the wrong server.
// The Supabase project's address and public (anon) key are baked in at build time from
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the environment, or .env.production).
// Usage: run before electron-builder.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = resolve(import.meta.dirname, '..', '.env.production')
const fromFile = existsSync(file)
  ? Object.fromEntries(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.match(/^(VITE_[A-Z_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim()])
    )
  : {}
const get = (name) => process.env[name] ?? fromFile[name] ?? ''
const url = get('VITE_SUPABASE_URL')
const key = get('VITE_SUPABASE_ANON_KEY')

let problem = ''
if (!url || !key) problem = 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.production.example to .env.production and fill them in.'
else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) problem = `VITE_SUPABASE_URL is ${url}: use the live project's address, https://<ref>.supabase.co.`
else {
  // The anon key names its project and role; never ship the service-role key in the app.
  let claims = {}
  try {
    claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
  } catch {}
  const ref = url.slice('https://'.length).split('.')[0]
  if (claims.role !== 'anon') problem = 'VITE_SUPABASE_ANON_KEY is not an anon key (copy the legacy "anon" key, the one starting eyJ). Never put the service-role key in the app.'
  else if (claims.ref !== ref) problem = `VITE_SUPABASE_ANON_KEY belongs to project ${claims.ref}, not ${ref}.`
  else {
    // Staff must get the live project, never the test one: compare with .env.supabase when it is here.
    const keysFile = resolve(import.meta.dirname, '..', '.env.supabase')
    const projects = existsSync(keysFile)
      ? Object.fromEntries(
          readFileSync(keysFile, 'utf8')
            .split(/\r?\n/)
            .map((l) => l.match(/^(STAGING_URL|LIVE_URL)=("?)(.*?)\2\s*(#.*)?$/))
            .filter(Boolean)
            .map((m) => [m[1], m[3].replace(/\/+$/, '')])
        )
      : {}
    if (projects.STAGING_URL === url) problem = `VITE_SUPABASE_URL is the STAGING project (${url}). Releases must use the live project.`
    else if (projects.LIVE_URL && projects.LIVE_URL !== url) problem = `VITE_SUPABASE_URL (${url}) is not the live project in .env.supabase (LIVE_URL).`
  }
}

if (problem) {
  console.error(`\n  Release stopped: ${problem}\n`)
  process.exit(1)
}
console.log(`Release build will use the Supabase project ${url}`)
