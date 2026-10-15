import { create } from 'zustand'
import PocketBase from 'pocketbase'
import { pb, type UserRecord } from '@/lib/pb'
import { forget, loadAccounts, markNeedsPassword, remember, updateAccount } from '@/lib/rememberedAccounts'

/** How often the other remembered accounts' tokens are renewed, so they don't expire unused. */
const KEEP_ALIVE_MS = 6 * 60 * 60_000
let keepAliveTimer: ReturnType<typeof setInterval> | undefined

interface SessionState {
  user: UserRecord | null
  /** False until the saved session has been checked with the server at startup. */
  ready: boolean
  login(email: string, password: string): Promise<void>
  logout(): void
  /** Re-reads the signed-in user (e.g. after a profile edit). */
  reload(): Promise<void>
  init(): Promise<void>
}

function currentUser(): UserRecord | null {
  return pb.authStore.isValid ? (pb.authStore.record as unknown as UserRecord) : null
}

// Tell the main process who is signed in, so the tracker writes as that user.
function shareWithMain(): void {
  const user = currentUser()
  window.tracker?.setSession(
    user ? { token: pb.authStore.token, userId: user.id, role: user.role, consented: !!user.tracking_consent_at } : null
  )
}

/**
 * Renews the saved tokens of the remembered accounts that aren't signed in, each on its
 * own client. One the server refuses is marked "needs password"; offline changes nothing.
 */
async function keepRememberedAlive(): Promise<void> {
  const currentId = pb.authStore.record?.id
  for (const a of loadAccounts()) {
    if (a.id === currentId || a.needsPassword || !a.token) continue
    const client = new PocketBase(pb.baseURL)
    client.autoCancellation(false)
    client.authStore.save(a.token, a.record as never)
    try {
      await client.collection('users').authRefresh()
      updateAccount(client.authStore.record as unknown as UserRecord, client.authStore.token)
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status && status >= 400 && status < 500) markNeedsPassword(a.id)
    }
  }
}

export const useSession = create<SessionState>((set) => {
  pb.authStore.onChange(() => {
    // Every sign-in, switch and token refresh keeps this PC's list of accounts current.
    const user = currentUser()
    if (user) remember(user, pb.authStore.token)
    set({ user })
    shareWithMain()
  })
  // The tracker found the token dead (expired, password reset, deactivated): show Login.
  // Its segments stay queued and sync after the next sign-in.
  window.tracker?.onSessionExpired(() => {
    if (pb.authStore.record) markNeedsPassword(pb.authStore.record.id)
    if (pb.authStore.token) pb.authStore.clear()
  })

  return {
    user: currentUser(),
    ready: false,

    async login(email, password) {
      const typed = email.trim()
      try {
        await pb.collection('users').authWithPassword(typed, password)
      } catch (err) {
        // Accounts made in the app (Add employee, Create an account) are stored in
        // lower case and the server matches emails exactly, so also try that.
        const lower = typed.toLowerCase()
        if (lower === typed || (err as { status?: number }).status !== 400) throw err
        await pb.collection('users').authWithPassword(lower, password)
      }
    },

    logout() {
      // Signing out of an account also drops its saved token from Switch account.
      if (pb.authStore.record) forget(pb.authStore.record.id)
      pb.authStore.clear()
      window.location.hash = '#/'
    },

    async reload() {
      if (pb.authStore.isValid) await pb.collection('users').authRefresh()
    },

    async init() {
      if (pb.authStore.isValid) {
        try {
          await pb.collection('users').authRefresh()
        } catch (err) {
          // Expired, revoked or deactivated: start from the login screen. Offline keeps the saved session.
          const status = (err as { status?: number }).status
          if (status && status >= 400 && status < 500) {
            if (pb.authStore.record) markNeedsPassword(pb.authStore.record.id)
            pb.authStore.clear()
          }
        }
      }
      shareWithMain()
      set({ user: currentUser(), ready: true })
      if (!keepAliveTimer) {
        void keepRememberedAlive()
        keepAliveTimer = setInterval(() => void keepRememberedAlive(), KEEP_ALIVE_MS)
      }
    }
  }
})

/** Friendly text for a PocketBase error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { status?: number; response?: { message?: string; data?: Record<string, { message?: string }> } }
  if (e?.status === 0) return 'Cannot reach the server. Check your connection.'
  const field = e?.response?.data && Object.values(e.response.data)[0]?.message
  return field || e?.response?.message || fallback
}
