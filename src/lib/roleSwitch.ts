// Switch role: an admin views the app as another person (the org function's switch-to, admins
// only). The admin's own session is kept here so "Back to me" needs no password and the tracker
// keeps recording the admin. Same trust level as the saved session (localStorage).
import { createClient } from '@supabase/supabase-js'
import type { UserRecord } from './db'

export interface SessionTokens {
  access_token: string
  refresh_token: string
}

export interface HomeAccount {
  session: SessionTokens
  record: UserRecord
}

const KEY = 'pseo.homeAccount'

export function loadHome(): HomeAccount | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return parsed && typeof parsed.session?.refresh_token === 'string' && parsed.record?.id ? parsed : null
  } catch {
    return null
  }
}

export function saveHome(home: HomeAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(home))
  } catch {
    // Storage blocked: "Back to me" then needs a normal sign-in.
  }
}

export function clearHome(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

/** Viewing as someone else: there is a saved admin, and it isn't the signed-in account. */
export function viewingAs(home: HomeAccount | null, currentId: string | undefined): boolean {
  return !!home && !!currentId && home.record.id !== currentId
}

/**
 * Renews the saved admin session (access tokens last an hour) and stores the new tokens.
 * Returns the fresh tokens, or null when the server no longer accepts it (then it is dropped).
 */
export async function refreshHome(): Promise<SessionTokens | null> {
  const home = loadHome()
  if (!home) return null
  const client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'pseo.home' }
  })
  const { data, error } = await client.auth.refreshSession({ refresh_token: home.session.refresh_token })
  if (error || !data.session) {
    if (error && error.status && error.status >= 400 && error.status < 500) clearHome()
    return null
  }
  const session = { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
  saveHome({ ...home, session })
  return session
}

/** People to switch to, grouped admin → manager → employee, by name; switched-off and waiting ones left out. */
export function switchTargets<T extends Pick<UserRecord, 'id' | 'role' | 'full_name' | 'active'> & { pending_approval?: boolean }>(
  people: T[]
): T[] {
  const order = { admin: 0, manager: 1, employee: 2 }
  return people
    .filter((p) => p.active && !p.pending_approval)
    .sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || a.full_name.localeCompare(b.full_name))
}
