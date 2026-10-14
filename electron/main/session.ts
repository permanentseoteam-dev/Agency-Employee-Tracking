// The main process's own PocketBase client (plan §3). It writes as the user the
// renderer signed in, refreshes that token at startup and every 12 hours, and
// on a dead token keeps the tracker queuing while the renderer shows Login.
import PocketBase, { type RecordModel } from 'pocketbase'
import type { SessionInfo } from '../preload/api'
import { log } from './log'
import { persisted, type Identity } from './store'

const REFRESH_MS = 12 * 60 * 60 * 1000

export const pb = new PocketBase(import.meta.env.VITE_PB_URL)
pb.autoCancellation(false)

let signedIn = false
let refreshedAtStartup = false
const changeListeners = new Set<() => void>()
const expiredListeners = new Set<() => void>()

function emit(): void {
  for (const fn of changeListeners) fn()
}

/** The person the tracker records time for (kept after sign-out). */
export function identity(): Identity | null {
  return persisted().get('identity')
}

/** True while the main process holds a token the server accepts. */
export function isSignedIn(): boolean {
  return signedIn && pb.authStore.isValid
}

export function onSessionChange(fn: () => void): () => void {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

/** The server refused the token: the renderer should show Login. */
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

/** From the renderer: a sign-in, a refreshed token, a profile change, or a sign-out (null). */
export function setFromRenderer(info: SessionInfo | null): void {
  if (!info) {
    if (signedIn) log.info('signed out; tracking keeps queuing until the next sign-in')
    pb.authStore.clear()
    signedIn = false
    emit()
    return
  }
  const wasSignedIn = isSignedIn()
  const before = identity()?.userId
  pb.authStore.save(info.token, { id: info.userId, collectionName: 'users', role: info.role } as unknown as RecordModel)
  remember({ userId: info.userId, role: info.role, consented: info.consented })
  signedIn = true
  if (!wasSignedIn || before !== info.userId) log.info(`signed in as ${info.userId} (${info.role})`)
  emit()
  if (!refreshedAtStartup) {
    refreshedAtStartup = true
    void refresh()
  }
}

/** Checks the token with the server. False only when the server says it is no longer valid. */
export async function refresh(): Promise<boolean> {
  if (!pb.authStore.token) return false
  try {
    const { record } = await pb.collection('users').authRefresh()
    remember({ userId: record.id, role: String(record.role), consented: !!record.tracking_consent_at })
    signedIn = true
    emit()
    return true
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401 || status === 403) {
      expire()
      return false
    }
    return true // offline: keep the token and try again later
  }
}

/** The server no longer accepts the token. */
export function expire(): void {
  if (!signedIn) return
  log.warn('session expired: queuing segments until the user signs in again')
  pb.authStore.clear()
  signedIn = false
  for (const fn of expiredListeners) fn()
  emit()
}

export function startSessionRefresh(): void {
  setInterval(() => void refresh(), REFRESH_MS).unref()
}
