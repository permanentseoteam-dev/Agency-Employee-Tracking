// The main process's own Supabase client (plan §3). It writes as the user the renderer signed
// in, using the access token the renderer hands over; the renderer renews the session (every
// hour) and passes each new token on, so only one side ever refreshes. On a dead session it
// keeps the tracker queuing while the renderer shows Login.
import { createClient } from '@supabase/supabase-js'
import type { SessionInfo } from '../preload/api'
import { log } from './log'
import { persisted, type Identity } from './store'

const CHECK_MS = 12 * 60 * 60 * 1000
const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

let token = ''
let signedIn = false
let checkedAtStartup = false
const changeListeners = new Set<() => void>()
const expiredListeners = new Set<() => void>()

/** Queries as the signed-in user (the renderer's latest access token). */
export const db = createClient(URL, KEY, { accessToken: async () => token || KEY })

function emit(): void {
  for (const fn of changeListeners) fn()
}

/** The person the tracker records time for (kept after sign-out). */
export function identity(): Identity | null {
  return persisted().get('identity')
}

/** True while the main process holds a token the server accepts. */
export function isSignedIn(): boolean {
  return signedIn && !!token
}

export function onSessionChange(fn: () => void): () => void {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

/** The server refused the session: the renderer should show Login. */
export function onSessionExpired(fn: () => void): () => void {
  expiredListeners.add(fn)
  return () => expiredListeners.delete(fn)
}

function remember(next: Identity): void {
  const prev = identity()
  if (prev?.userId !== next.userId || prev.role !== next.role || prev.consented !== next.consented) {
    persisted().set('identity', next)
  }
}

/** From the renderer: a sign-in, a renewed token, a profile change, or a sign-out (null). */
export function setFromRenderer(info: SessionInfo | null): void {
  if (!info) {
    if (signedIn) log.info('signed out; tracking keeps queuing until the next sign-in')
    token = ''
    signedIn = false
    emit()
    return
  }
  const wasSignedIn = isSignedIn()
  const before = identity()?.userId
  token = info.token
  remember({ userId: info.userId, role: info.role, consented: info.consented })
  signedIn = true
  if (!wasSignedIn || before !== info.userId) log.info(`signed in as ${info.userId} (${info.role})`)
  emit()
  if (!checkedAtStartup) {
    checkedAtStartup = true
    void refresh()
  }
}

/**
 * Checks the session with the server (a reset password or a switched-off account ends it).
 * False only when the server says it is no longer valid; offline keeps the token.
 */
export async function refresh(): Promise<boolean> {
  if (!token) return false
  try {
    const res = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
    if (res.status === 401 || res.status === 403) {
      expire()
      return false
    }
    if (!res.ok) return true
    const user = (await res.json()) as { id: string }
    const { data } = await db.from('profiles').select('role, tracking_consent_at, active').eq('id', user.id).maybeSingle()
    if (data && !data.active) {
      expire()
      return false
    }
    if (data) remember({ userId: user.id, role: String(data.role), consented: !!data.tracking_consent_at })
    signedIn = true
    emit()
    return true
  } catch {
    return true // offline: keep the token and try again later
  }
}

/** The server no longer accepts the session. */
export function expire(): void {
  if (!signedIn) return
  log.warn('session expired: queuing segments until the user signs in again')
  token = ''
  signedIn = false
  for (const fn of expiredListeners) fn()
  emit()
}

export function startSessionRefresh(): void {
  setInterval(() => void refresh(), CHECK_MS).unref()
}
