import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { AppError, supabase, toUser, type UserRecord } from '@/lib/db'

/** The last signed-in account, so the app still shows who is signed in when it starts offline. */
const USER_KEY = 'pseo.user'
/** "Remember me" on the sign-in screen: 'false' means sign in again each time the app starts. */
export const REMEMBER_KEY = 'pseo.rememberMe'
const remembered = (): boolean => {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false'
  } catch {
    return true
  }
}
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

// Tell the main process who is signed in, so the tracker writes as that user.
function shareWithMain(user: UserRecord | null): void {
  window.tracker?.setSession(
    user && session ? { token: session.access_token, userId: user.id, role: user.role, consented: !!user.tracking_consent_at } : null
  )
}

/**
 * Switch role was removed (2026-10-17). A PC that was left "viewing as" someone still holds the
 * admin's saved account under this key: drop it, and end the borrowed session so the tracker
 * never records the admin as that person. Returns true when the borrowed session must end.
 */
const OLD_SWITCH_KEY = 'pseo.homeAccount'
function endLeftoverSwitch(currentUserId: string | undefined): boolean {
  try {
    const raw = localStorage.getItem(OLD_SWITCH_KEY)
    if (!raw) return false
    localStorage.removeItem(OLD_SWITCH_KEY)
    const homeId = (JSON.parse(raw) as { record?: { id?: string } } | null)?.record?.id
    return !!currentUserId && !!homeId && homeId !== currentUserId
  } catch {
    return false
  }
}

export const useSession = create<SessionState>((set, get) => {
  const apply = async (s: Session | null) => {
    session = s
    if (!s) {
      cache(null)
      set({ user: null })
      shareWithMain(null)
      return
    }
    try {
      const user = await loadUser(s)
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
      void supabase.auth.signOut({ scope: 'local' })
      window.location.hash = '#/'
    },

    async reload() {
      if (session) await apply(session)
    },

    async init() {
      const { data } = await supabase.auth.getSession()
      session = data.session
      // "Remember me" was off: this is a new start of the app, so ask for the password again.
      // The tracker keeps queuing the time until the next sign-in.
      if (session && !remembered()) {
        await supabase.auth.signOut({ scope: 'local' })
        session = null
      }
      if (session && endLeftoverSwitch(session.user.id)) {
        await supabase.auth.signOut({ scope: 'local' })
        session = null
      }
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
    }
  }
})

/** Friendly text for any server error (AppError, or a Supabase / network error). */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { status?: number; message?: string; response?: { message?: string; data?: Record<string, { message?: string }> } }
  if (e?.status === 0 || err instanceof TypeError) return 'Cannot reach the server. Check your connection.'
  const field = e?.response?.data && Object.values(e.response.data)[0]?.message
  return field || e?.response?.message || (err instanceof AppError ? e.message : '') || fallback
}
