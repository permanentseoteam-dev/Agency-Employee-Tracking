import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { AppError, supabase, toUser, type UserRecord } from '@/lib/db'
import { clearHome, loadHome, refreshHome, viewingAs } from '@/lib/roleSwitch'

/** The admin's own saved session is renewed this often while viewing as someone else (tokens last an hour). */
const KEEP_ALIVE_MS = 30 * 60_000
/** The last signed-in account, so the app still shows who is signed in when it starts offline. */
const USER_KEY = 'pseo.user'
let keepAliveTimer: ReturnType<typeof setInterval> | undefined
let session: Session | null = null

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

const cached = (): UserRecord | null => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}
const cache = (u: UserRecord | null) => {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // storage blocked
  }
}

/** The profile (and own email) of a session's account. Throws on a connection problem. */
async function loadUser(s: Session | null): Promise<UserRecord | null> {
  if (!s) return null
  const [p, e] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
    supabase.from('profile_emails').select('email').eq('id', s.user.id).maybeSingle()
  ])
  if (p.error) throw new AppError(p.status ?? 0, p.error.message)
  return p.data ? toUser(p.data, e.data?.email ?? s.user.email ?? '') : null
}

// Tell the main process who is signed in, so the tracker writes as that user. While an admin
// views the app as someone else (Switch role), the tracker keeps recording the admin.
function shareWithMain(user: UserRecord | null): void {
  const home = loadHome()
  const me = viewingAs(home, user?.id)
    ? { token: home!.session.access_token, record: home!.record }
    : user && session
      ? { token: session.access_token, record: user }
      : null
  window.tracker?.setSession(
    me ? { token: me.token, userId: me.record.id, role: me.record.role, consented: !!me.record.tracking_consent_at } : null
  )
}

/** Renews the admin's own session while viewing as someone else, and hands the tracker the new token. */
async function keepHomeAlive(): Promise<void> {
  if (!viewingAs(loadHome(), useSession.getState().user?.id)) return
  if (await refreshHome()) shareWithMain(useSession.getState().user)
}

export const useSession = create<SessionState>((set, get) => {
  const apply = async (s: Session | null) => {
    session = s
    if (!s) {
      clearHome()
      cache(null)
      set({ user: null })
      shareWithMain(null)
      return
    }
    try {
      const user = await loadUser(s)
      // Back on the admin's own account: nothing is being viewed as anyone else.
      if (!user || loadHome()?.record.id === user.id) clearHome()
      cache(user)
      set({ user })
      shareWithMain(user)
    } catch {
      shareWithMain(get().user) // offline: keep showing the saved account
    }
  }

  supabase.auth.onAuthStateChange((event, s) => {
    // Supabase asks not to await other calls inside this callback.
    if (event === 'TOKEN_REFRESHED') {
      session = s
      setTimeout(() => shareWithMain(get().user), 0)
    } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      if (event === 'SIGNED_IN' && s?.user.id === get().user?.id && session?.access_token === s?.access_token) return
      setTimeout(() => void apply(s), 0)
    }
  })
  // The tracker found the token dead (password reset, deactivated): show Login.
  // Its segments stay queued and sync after the next sign-in.
  window.tracker?.onSessionExpired(() => void supabase.auth.signOut({ scope: 'local' }))

  return {
    user: cached(),
    ready: false,

    async login(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error) {
        const code = (error as { code?: string }).code
        const status = !error.status ? 0 : code === 'user_banned' ? 403 : error.status === 429 ? 429 : 400
        throw new AppError(status, error.message, code)
      }
      await apply(data.session)
      if (!get().user) {
        await supabase.auth.signOut({ scope: 'local' })
        throw new AppError(403, 'Your account is waiting for your admin’s approval, or it has been switched off.')
      }
    },

    logout() {
      clearHome()
      void supabase.auth.signOut({ scope: 'local' })
      window.location.hash = '#/'
    },

    async reload() {
      if (session) await apply(session)
    },

    async init() {
      const { data } = await supabase.auth.getSession()
      session = data.session
      if (session) {
        // Checks the session with the server: a reset password or a switched-off account ends it.
        const { error } = await supabase.auth.getUser()
        if (error && error.status && error.status >= 400 && error.status < 500) {
          await supabase.auth.signOut({ scope: 'local' })
          session = null
        }
      }
      await apply(session)
      set({ ready: true })
      if (!keepAliveTimer) {
        void keepHomeAlive()
        keepAliveTimer = setInterval(() => void keepHomeAlive(), KEEP_ALIVE_MS)
      }
    }
  }
})

/** The signed-in session's tokens (Switch role keeps them as the admin's home account). */
export function currentTokens() {
  return session ? { access_token: session.access_token, refresh_token: session.refresh_token } : null
}

/** Friendly text for any server error (AppError, or a Supabase / network error). */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { status?: number; message?: string; response?: { message?: string; data?: Record<string, { message?: string }> } }
  if (e?.status === 0 || err instanceof TypeError) return 'Cannot reach the server. Check your connection.'
  const field = e?.response?.data && Object.values(e.response.data)[0]?.message
  return field || e?.response?.message || (err instanceof AppError ? e.message : '') || fallback
}
