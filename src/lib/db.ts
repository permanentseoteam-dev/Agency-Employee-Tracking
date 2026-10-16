// The app's one Supabase client. The session is kept in
// localStorage and renewed by supabase-js; the main process gets each new token (stores/session.ts).
import { createClient, FunctionsHttpError, type PostgrestError } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey: 'pseo.session', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
})

export type Role = 'admin' | 'manager' | 'employee'

/** An account as the screens use it: the profile row plus the email (own, or anyone's for admins). */
export interface UserRecord {
  id: string
  updated: string
  email?: string
  full_name: string
  avatar: string
  designation: string
  phone: string
  /** Team id, '' when none. */
  team: string
  role: Role
  joined_on: string
  left_on: string
  active: boolean
  must_change_password: boolean
  tracking_consent_at: string
  /** Signed up with Create an account and not yet approved by an admin. */
  pending_approval?: boolean
}

export interface OrgSettings {
  id: string
  updated: string
  shift_start: string
  shift_end: string
  work_days: number[]
  grace_minutes: number
  full_day_min_hours: number
  half_day_min_hours: number
  idle_threshold_minutes: number
  /** Leave per month, any leave type; 0 = no limit. */
  monthly_full_leaves: number
  /** Half-day (short) leaves per month; 0 = no limit. */
  monthly_half_leaves: number
  timezone: string
}

/**
 * Every failure the screens see, with the shape errorMessage() reads: status 0 = no connection,
 * and response.message = what the server said (the texts the server functions send).
 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = '',
    public hint = ''
  ) {
    super(message)
  }
  get response() {
    return { message: this.message, data: {} as Record<string, { message?: string }> }
  }
}

const offline = (err: unknown) => err instanceof TypeError || /fetch|network/i.test(String((err as Error)?.message))

/** Unwraps a supabase-js query result: returns data, or throws an AppError. */
export function must<T>(result: { data: T | null; error: PostgrestError | null; status?: number }): T {
  if (result.error) {
    const e = result.error
    const status = result.status ?? 0
    throw new AppError(status === 0 && !e.code ? 0 : status || 400, friendly(e), e.code, e.hint ?? '')
  }
  return result.data as T
}

function friendly(e: PostgrestError): string {
  if (e.code === '23505') return 'That already exists.'
  if (e.code === '42501') return 'You aren’t allowed to do that.'
  if (e.code === 'PGRST116') return 'Not found.'
  return e.message || 'Something went wrong. Please try again.'
}

/**
 * Calls an Edge Function with the signed-in user's token (or `token`, e.g. the admin's own while
 * viewing as someone else); errors carry the function's message.
 */
export async function call<T>(fn: string, body: Record<string, unknown> = {}, token?: string): Promise<T> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(fn, { body, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) })
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response
        const payload = await res.json().catch(() => null)
        throw new AppError(res.status, payload?.message ?? 'Something went wrong. Please try again.')
      }
      throw new AppError(0, 'Cannot reach the server. Check your connection.')
    }
    return data as T
  } catch (err) {
    if (err instanceof AppError) throw err
    if (offline(err)) throw new AppError(0, 'Cannot reach the server. Check your connection.')
    throw err
  }
}

/** The public address of a profile picture ('' when there is none). */
export function avatarUrl(user: Pick<UserRecord, 'id' | 'avatar'>): string {
  if (!user.avatar) return ''
  return supabase.storage.from('avatars').getPublicUrl(`${user.id}/${user.avatar}`).data.publicUrl
}

/** A profile row as a UserRecord (null team → ''). */
export function toUser(row: Record<string, unknown>, email?: string): UserRecord {
  return {
    ...(row as unknown as UserRecord),
    team: (row.team as string | null) ?? '',
    tracking_consent_at: (row.tracking_consent_at as string | null) ?? '',
    ...(email !== undefined ? { email } : {})
  }
}

/**
 * Follows live changes to a table (Supabase Realtime; the row-level security decides which rows
 * this person hears about) and calls `onChange` for each. Returns a function that stops it.
 */
export function live(table: string, onChange: (change: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => void): () => void {
  const channel = supabase
    .channel(`live:${table}:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => onChange(p as never))
    .subscribe()
  return () => void supabase.removeChannel(channel)
}

/** A profile row with its team embedded, as screens use it: Employee-like ({ expand: { team } }). */
export const PROFILE_WITH_TEAM = '*, team_row:teams!profiles_team_fkey(*), email_row:profile_emails(email)'
export function toEmployee<T = UserRecord>(row: Record<string, unknown>): T {
  const { team_row, email_row, ...rest } = row as Record<string, unknown> & { team_row?: Record<string, unknown> | null; email_row?: { email?: string } | null }
  return { ...toUser(rest, email_row?.email ?? undefined), expand: team_row ? { team: team_row } : {} } as T
}

/**
 * Every row of a query, page by page: Supabase returns at most 1,000 rows per request, and a
 * month of 5-minute segments (or a month of attendance for a team) is more than that.
 * `build` must give the same ordered query each time.
 */
export async function selectAll<T>(build: () => { range(from: number, to: number): PromiseLike<{ data: unknown; error: PostgrestError | null; status?: number }> }, pageSize = 1000): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const rows = must(await build().range(from, from + pageSize - 1)) as T[]
    out.push(...rows)
    if (rows.length < pageSize) return out
  }
}
