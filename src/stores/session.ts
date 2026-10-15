import { create } from 'zustand'
import PocketBase from 'pocketbase'
import { pb, type UserRecord } from '@/lib/pb'
import { clearHome, loadHome, saveHome, viewingAs } from '@/lib/roleSwitch'

/** How often the admin's own saved sign-in is renewed while viewing as someone else. */
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

// Tell the main process who is signed in, so the tracker writes as that user. While an
// admin views the app as someone else (Switch role), the tracker keeps recording the admin.
function shareWithMain(): void {
  const user = currentUser()
  const home = loadHome()
  const me = viewingAs(home, user?.id) ? { token: home!.token, record: home!.record } : user ? { token: pb.authStore.token, record: user } : null
  window.tracker?.setSession(
    me ? { token: me.token, userId: me.record.id, role: me.record.role, consented: !!me.record.tracking_consent_at } : null
  )
}

/** Renews the admin's own saved sign-in while viewing as someone else; drops it once the server refuses it. */
async function keepHomeAlive(): Promise<void> {
  const home = loadHome()
  if (!viewingAs(home, pb.authStore.record?.id)) return
  const client = new PocketBase(pb.baseURL)
  client.autoCancellation(false)
  client.authStore.save(home!.token, home!.record as never)
  try {
    await client.collection('users').authRefresh()
    saveHome({ token: client.authStore.token, record: client.authStore.record as unknown as UserRecord })
    shareWithMain()
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status && status >= 400 && status < 500) clearHome()
  }
}

export const useSession = create<SessionState>((set) => {
  pb.authStore.onChange(() => {
    const user = currentUser()
    // Back on the admin's own account (or signed out): nothing is being viewed as anyone else.
    if (!user || loadHome()?.record.id === user.id) clearHome()
    set({ user })
    shareWithMain()
  })
  // The tracker found the token dead (expired, password reset, deactivated): show Login.
  // Its segments stay queued and sync after the next sign-in.
  window.tracker?.onSessionExpired(() => {
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
      clearHome()
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
          if (status && status >= 400 && status < 500) pb.authStore.clear()
        }
      }
      shareWithMain()
      set({ user: currentUser(), ready: true })
      if (!keepAliveTimer) {
        void keepHomeAlive()
        keepAliveTimer = setInterval(() => void keepHomeAlive(), KEEP_ALIVE_MS)
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
