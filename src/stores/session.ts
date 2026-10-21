import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { AppError, supabase, toUser, type UserRecord } from '@/lib/db'

/** The last signed-in account, so the app still shows who is signed in when it starts offline. */
const USER_KEY = 'pseo.user'
/** "Remember me" on the sign-in screen: 'false' means sign in again each time the app starts. */
export const REMEMBER_KEY = 'pseo.rememberMe'
/** Set for the life of this app window (survives a page reload, not a restart of the app). */
const THIS_RUN_KEY = 'pseo.signedInThisRun'

/**
 * Whether a saved session must be dropped when the app starts: "Remember me" was off and
 * this is a new start of the app (not a reload of the same window). Pure, so it is tested.
 */
export function forgetAtStart(rememberMe: string | null, signedInThisRun: string | null): boolean {
  return rememberMe === 'false' && signedInThisRun !== '1'
}

/** A line in the app's log for every sign-in change (event names and reasons, never tokens). */
const note = (message: string) => window.tracker?.logInfo?.(`auth: ${message}`)

function readFlags(): { rememberMe: string | null; thisRun: string | null } {
  try {
    return { rememberMe: localStorage.getItem(REMEMBER_KEY), thisRun: sessionStorage.getItem(THIS_RUN_KEY) }
  } catch {
    return { rememberMe: null, thisRun: null }
  }
}

/** After a sign-in: mark this app run, so a reload doesn't count as a new start. */
export function markSignedInThisRun(): void {
  try {
    sessionStorage.setItem(THIS_RUN_KEY, '1')
  } catch {
    // storage blocked
  }
}
let session: Session | null = null

/**
 * Runs when a different person (or nobody) becomes signed in, before the screens see it: main.tsx
 * drops every cached answer there. Otherwise one fetched with no session in the moment of a Log out
 * (empty: the server only answers people signed in) is shown to the next person.
 */
let onUserChange: () => void = () => {}
export function setOnUserChange(fn: () => void): void {
  onUserChange = fn
}

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
  const changeTo = (next: UserRecord | null) => {
    if ((next?.id ?? "") !== (get().user?.id ?? "")) onUserChange()
    set({ user: next })
  }
  const apply = async (s: Session | null) => {
    session = s
    if (!s) {
      cache(null)
      changeTo(null)
      shareWithMain(null)
      return
    }
    try {
      const user = await loadUser(s)
      cache(user)
      changeTo(user)
      shareWithMain(user)
    } catch {
      shareWithMain(get().user) // offline: keep showing the saved account
    }
  }

  supabase.auth.onAuthStateChange((event, s) => {
    // Supabase asks not to await other calls inside this callback.
    if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') note(`event ${event}`)
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
  window.tracker?.onSessionExpired(() => {
    note('signed out: the tracker found the session refused by the server')
    void supabase.auth.signOut({ scope: 'local' })
  })

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
      markSignedInThisRun()
      if (!get().user) {
        await supabase.auth.signOut({ scope: 'local' })
        throw new AppError(403, 'Your account is waiting for your admin’s approval, or it has been switched off.')
      }
    },

    logout() {
      note('signed out: Log out was clicked')
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
      const flags = readFlags()
      if (session && forgetAtStart(flags.rememberMe, flags.thisRun)) {
        note('signed out at start: Remember me was off')
        await supabase.auth.signOut({ scope: 'local' })
        session = null
      }
      if (session && endLeftoverSwitch(session.user.id)) {
        note('signed out at start: an old Switch role session was left')
        await supabase.auth.signOut({ scope: 'local' })
        session = null
      }
      if (session) {
        // Checks the session with the server: a reset password or a switched-off account ends it.
        const { error } = await supabase.auth.getUser()
        if (error && error.status && error.status >= 400 && error.status < 500) {
          note(`signed out at start: the server refused the saved session (${error.status} ${error.message})`)
          await supabase.auth.signOut({ scope: 'local' })
          session = null
        }
      }
      if (session) markSignedInThisRun()
      note(session ? 'restored the saved session at start' : 'no saved session at start')
      await apply(session)
      set({ ready: true })
    }
  }
})

/**
 * Asks the server whether this sign-in still counts, when an answer that everyone signed in gets came
 * back empty. A session the server ended (a password reset, a switched-off account, signed out elsewhere)
 * still has a token here, but every read is empty until then: sign out, so the sign-in screen shows
 * instead of empty pages. Returns true when it signed out.
 */
export async function endIfSignInRefused(why: string): Promise<boolean> {
  if (!(await supabase.auth.getSession()).data.session) return false
  const { error } = await supabase.auth.getUser()
  if (!error || !error.status || error.status < 400 || error.status >= 500) return false
  note(`signed out: ${why}, and the server refused the session (${error.status} ${error.message})`)
  await supabase.auth.signOut({ scope: 'local' })
  return true
}

/** Friendly text for any server error (AppError, or a Supabase / network error). */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as { status?: number; message?: string; response?: { message?: string; data?: Record<string, { message?: string }> } }
  if (e?.status === 0 || err instanceof TypeError) return 'Cannot reach the server. Check your connection.'
  const field = e?.response?.data && Object.values(e.response.data)[0]?.message
  return field || e?.response?.message || (err instanceof AppError ? e.message : '') || fallback
}
