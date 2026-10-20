// The test database is the STAGING Supabase project (.env.supabase, STAGING_*), never live.
// A test run starts from staging's default rows (settings, leave types, star rules), seeds a
// test company on it, and puts staging back to those defaults when it stops.
// `api` gives seed.mjs and seed-extras.mjs the create/list/update shape they used with
// PocketBase: plain tables through the service role, accounts through Auth, and leave and
// attendance through the same Edge Functions the app calls.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { ROOT } from '../e2e/lib/cdp.mjs'

export const PASSWORD = 'Test-pass-123'
/** Every test account uses this domain; reset deletes only these accounts. */
const TEST_DOMAIN = '@test.local'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

/** STAGING_* from .env.supabase (git-ignored). */
export function stagingEnv() {
  const env = Object.fromEntries(
    readFileSync(join(ROOT, '.env.supabase'), 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)=("?)(.*?)\2\s*(#.*)?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[3]])
  )
  for (const k of ['STAGING_URL', 'STAGING_ANON_KEY', 'STAGING_SERVICE_ROLE_KEY', 'STAGING_DB_HOST', 'STAGING_DB_PASSWORD']) {
    if (!env[k]) throw new Error(`${k} is missing in .env.supabase`)
  }
  if (env.LIVE_URL && env.LIVE_URL === env.STAGING_URL) throw new Error('STAGING_URL is the live project: refusing to use it for tests')
  return {
    url: env.STAGING_URL,
    anonKey: env.STAGING_ANON_KEY,
    serviceKey: env.STAGING_SERVICE_ROLE_KEY,
    ref: new URL(env.STAGING_URL).hostname.split('.')[0],
    dbHost: env.STAGING_DB_HOST,
    dbPassword: env.STAGING_DB_PASSWORD
  }
}

/** Seeds on a clean staging and returns { url, anonKey, ref, api, stop }; stop() resets staging. */
export async function startTestServer() {
  const env = stagingEnv()
  await resetStaging(env)
  return {
    url: env.url,
    anonKey: env.anonKey,
    ref: env.ref,
    api: makeApi(env),
    stop: () => resetStaging(env)
  }
}

/**
 * Puts staging back to its default rows: deletes every data row and every @test.local account
 * (with its profile picture), and restores the default settings, leave types and star rules.
 * Guards are switched off for this one transaction, so finalized test payroll can go too.
 */
export async function resetStaging(env = stagingEnv()) {
  const root = createClient(env.url, env.serviceKey, opts)
  const sql = postgres({
    host: env.dbHost,
    port: 5432,
    database: 'postgres',
    username: `postgres.${env.ref}`,
    password: env.dbPassword,
    ssl: 'require',
    prepare: false
  })
  try {
    await sql.begin(async (tx) => {
      await tx`set local app.bypass_guards = 'on'`
      for (const t of ['star_records', 'notifications', 'project_events', 'clients', 'payroll_items', 'payroll_runs', 'attendance',
        'activity_segments', 'presence', 'leave_requests', 'salaries', 'events', 'holidays']) {
        await tx.unsafe(`delete from public.${t}`)
      }
      await tx`update public.profiles set team = null where team is not null`
      await tx`delete from public.teams`
      await tx`delete from public.leave_types where name not in ('Sick', 'Casual', 'Annual')`
      await tx`update public.leave_types set paid = true, yearly_quota_days = case name when 'Sick' then 8 when 'Casual' then 10 else 14 end`
      await tx`delete from public.star_rules where auto = ''`
      await tx`update public.star_rules set stars = 0`
      await tx`update public.org_settings set shift_start = '09:00', shift_end = '18:00', work_days = '[1,2,3,4,5]', grace_minutes = 15,
        full_day_min_hours = 8, half_day_min_hours = 4, idle_threshold_minutes = 5, timezone = 'Asia/Karachi',
        monthly_full_leaves = 0, monthly_half_leaves = 0,
        required_daily_minutes = 360, star_block_minutes = 30, star_value_mode = 'half_hour_pay', star_value_pkr = 0`
    })
  } finally {
    await sql.end()
  }

  for (let more = true; more; ) {
    const { data, error } = await root.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw new Error(`list accounts: ${error.message}`)
    const test = data.users.filter((u) => u.email?.endsWith(TEST_DOMAIN))
    for (const u of test) {
      const { data: files } = await root.storage.from('avatars').list(u.id)
      if (files?.length) await root.storage.from('avatars').remove(files.map((f) => `${u.id}/${f.name}`))
      const { error: delError } = await root.auth.admin.deleteUser(u.id)
      if (delError) throw new Error(`delete account: ${delError.message}`)
    }
    more = test.length > 0 && data.users.length === 1000
  }
}

/** A record id like PocketBase's (and public.new_id()): 15 characters, a–z and 0–9. */
const newId = () => [...randomBytes(15)].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')

/** The PocketBase-shaped test API on staging. A "token" is a signed-in client (tokenOf). */
export function makeApi(env) {
  const root = createClient(env.url, env.serviceKey, opts)
  const signedIn = new Map()

  const rows = async (query, what) => {
    const { data, error } = await query
    if (error) throw Object.assign(new Error(`${what}: ${error.message}`), { status: 400, data: error })
    return data
  }
  /** Calls an Edge Function as `token` (or the service role); errors carry its message. */
  const fn = async (name, body, token) => {
    const { data, error } = await (token ?? root).functions.invoke(name, { body })
    if (!error) return data
    const res = error.context
    const payload = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
    throw Object.assign(new Error(`${name} → ${res?.status ?? 0} ${payload?.message ?? error.message}`), { status: res?.status ?? 0, data: payload })
  }
  /** A users-collection body as profile columns ('' → null for the team and consent time). */
  const profileOf = (b) => {
    const p = {}
    for (const k of ['full_name', 'role', 'designation', 'phone', 'active', 'joined_on', 'left_on', 'must_change_password']) {
      if (b[k] !== undefined) p[k] = b[k]
    }
    if (b.team !== undefined) p.team = b.team || null
    if (b.tracking_consent_at !== undefined) p.tracking_consent_at = b.tracking_consent_at || null
    return p
  }
  const userOf = (row) => {
    const { email_row, ...p } = row
    return { ...p, email: email_row?.email ?? '', team: p.team ?? '', tracking_consent_at: p.tracking_consent_at ?? '' }
  }

  async function createUser(b) {
    const { data, error } = await root.auth.admin.createUser({
      email: b.email,
      password: b.password,
      email_confirm: true,
      user_metadata: { full_name: b.full_name ?? '' },
      ...(b.active === false ? { ban_duration: '876000h' } : {})
    })
    if (error) throw new Error(`create account ${b.email}: ${error.message}`)
    const [row] = await rows(root.from('profiles').update(profileOf(b)).eq('id', data.user.id).select('*, email_row:profile_emails(email)'), `profile ${b.email}`)
    return userOf(row)
  }

  return {
    url: env.url,
    async tokenOf(email, password = PASSWORD) {
      const key = `${email}\n${password}`
      if (!signedIn.has(key)) {
        const c = createClient(env.url, env.anonKey, opts)
        const { error } = await c.auth.signInWithPassword({ email, password })
        if (error) throw Object.assign(new Error(`sign in ${email}: ${error.message}`), { status: error.status })
        signedIn.set(key, c)
      }
      return signedIn.get(key)
    },
    /** The PocketBase routes the seed calls, mapped to their Edge Functions. */
    async call(method, path, body, token) {
      if (path === '/api/settings') return null // PocketBase batch API switch; Supabase needs none
      if (path === '/api/attendance/recompute') return fn('attendance-recompute', body, token)
      throw new Error(`test api: no Supabase mapping for ${method} ${path}`)
    },
    async create(collection, body, token) {
      if (collection === 'users') return createUser(body)
      if (collection === 'leave_requests') return fn('leave-request', body, token)
      const row = collection === 'activity_segments' && !body.id ? { id: newId(), ...body } : body
      return (await rows((token ?? root).from(collection).insert(row).select(), `create ${collection}`))[0]
    },
    async update(collection, id, body, token) {
      if (collection === 'users') return userOf((await rows(root.from('profiles').update(profileOf(body)).eq('id', id).select('*, email_row:profile_emails(email)'), 'update profile'))[0])
      if (collection === 'leave_requests') return fn('leave-update', { id, ...body }, token)
      return (await rows((token ?? root).from(collection).update(body).eq('id', id).select(), `update ${collection}`))[0]
    },
    async list(collection, filter = '', token) {
      if (filter) throw new Error('test api: list filters are PocketBase syntax; filter in JavaScript instead')
      if (collection === 'users') return (await rows((token ?? root).from('profiles').select('*, email_row:profile_emails(email)'), 'list profiles')).map(userOf)
      return rows((token ?? root).from(collection).select('*'), `list ${collection}`)
    },
    async batchCreate(collection, bodies) {
      const withIds = collection === 'activity_segments' ? bodies.map((b) => (b.id ? b : { id: newId(), ...b })) : bodies
      for (let i = 0; i < withIds.length; i += 500) await rows(root.from(collection).insert(withIds.slice(i, i + 500)), `create ${collection}`)
    }
  }
}
