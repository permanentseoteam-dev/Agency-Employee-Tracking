// Shared by every Edge Function: replies, the database, and who is calling.
// The database is reached directly (SUPABASE_DB_URL is set by Supabase for every function),
// as the PocketBase hooks did with e.app; row-level security doesn't apply to these queries,
// so each function checks the caller's role itself, like the PocketBase routes did.
import postgres from 'npm:postgres@3.4.5'
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

export const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message)
  }
}
export const badRequest = (m: string, data?: Record<string, unknown>) => new HttpError(400, m, data)
export const forbidden = (m: string) => new HttpError(403, m)
export const notFound = (m: string) => new HttpError(404, m)

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

export interface Caller {
  id: string
  role: 'admin' | 'manager' | 'employee'
  full_name: string
  team: string | null
  joined_on: string
  left_on: string
}

/** The signed-in, active, approved account making the request (PocketBase: e.auth). */
export async function caller(req: Request): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Sign in first.')
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Your sign-in has expired. Sign in again.')
  const [p] = await sql`select id, role, full_name, team, joined_on, left_on from profiles
    where id = ${data.user.id} and active and not pending_approval`
  if (!p) throw new HttpError(403, 'Your account is waiting for approval or has been switched off.')
  return p as Caller
}

/**
 * The service role (the hourly job, server scripts). Supabase verifies every token's signature
 * before a function runs (verify_jwt), so the role claim can be trusted here.
 */
export function isServiceCall(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== 'POST') return Object.fromEntries(new URL(req.url).searchParams)
  try {
    const b = await req.json()
    return b && typeof b === 'object' ? b : {}
  } catch {
    return {}
  }
}

/** Wraps a handler: CORS, JSON errors with the same messages the PocketBase routes gave. */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { message: err.message, data: err.data })
      console.error(err)
      return json(500, { message: 'Something went wrong on the server.' })
    }
  })
}

/** The org rules, as attendance_store.loadSettings returned them. */
export async function loadSettings() {
  const [s] = await sql`select * from org_settings limit 1`
  return {
    shift_start: s.shift_start as string,
    shift_end: s.shift_end as string,
    work_days: (s.work_days ?? []) as number[],
    grace_minutes: Number(s.grace_minutes) || 0,
    half_day_min_hours: Number(s.half_day_min_hours) || 0,
    full_day_min_hours: Number(s.full_day_min_hours) || 0,
    monthly_full_leaves: Number(s.monthly_full_leaves) || 0,
    monthly_half_leaves: Number(s.monthly_half_leaves) || 0,
    timezone: (s.timezone as string) || 'Asia/Karachi'
  }
}

/** A timestamptz from postgres.js as the PocketBase date text the logic libraries expect. */
export const pbDate = (v: Date | string | null) => (v ? new Date(v).toISOString().replace('T', ' ') : '')
