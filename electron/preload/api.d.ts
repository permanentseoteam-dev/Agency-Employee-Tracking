export interface SessionInfo {
  token: string
  userId: string
  /** The stored role (not the one picked in the role switcher). */
  role: string
  /** The tracking notice has been accepted (users.tracking_consent_at is set). */
  consented: boolean
}

export interface AutostartState {
  /** False in development, where registering electron.exe at login would be wrong. */
  supported: boolean
  enabled: boolean
  /** Employees can't turn it off. */
  locked: boolean
}

/** The org rules the tracker needs (a copy of the org_settings record). */
export interface TrackerSettings {
  shift_start: string
  shift_end: string
  work_days: number[]
  idle_threshold_minutes: number
  timezone: string
}

export interface TodayTotals {
  /** "YYYY-MM-DD" in the org timezone. */
  date: string
  active_s: number
  idle_s: number
}

export interface TrackerStatus {
  state: 'active' | 'idle' | 'off'
  /** Why the tracker is in that state. */
  reason: 'tracking' | 'starting' | 'outside_shift' | 'locked' | 'suspended' | 'no_consent' | 'no_user'
  /** False after the session expired: segments are queued until the next sign-in. */
  signedIn: boolean
  role: string
  /** Segments waiting to be synced. */
  pending: number
  today: TodayTotals
}

/** What the sign-in screen needs to know before it lets anyone sign in or register. */
export interface NetworkStatus {
  /** The server answered /api/health. */
  server: boolean
  /** This PC's Tailscale: not installed, service off, installed but not signed in, or connected. */
  tailscale: 'missing' | 'stopped' | 'signed_out' | 'running'
  /** Connected to the network that has the server (it lists the server's machine). */
  onAgencyNetwork: boolean
}

export interface TrackerApi {
  logError(message: string): void
  setSession(session: SessionInfo | null): void
  setSettings(settings: TrackerSettings): void
  getToday(): Promise<TodayTotals>
  getStatus(): Promise<TrackerStatus>
  /** Live status updates; returns an unsubscribe function. */
  onStatus(listener: (status: TrackerStatus) => void): () => void
  /** The main process found the session expired; the renderer should sign out. */
  onSessionExpired(listener: () => void): () => void
  getAutostart(): Promise<AutostartState>
  setAutostart(enabled: boolean): Promise<AutostartState>
  openLogsFolder(): Promise<void>
  /** Server reachability and this PC's Tailscale state (read-only). */
  networkStatus(): Promise<NetworkStatus>
  /** Quits the app (managers and admins); resolves false when the main process refuses. */
  quit(): Promise<boolean>
}

declare global {
  interface Window {
    tracker: TrackerApi
  }
}
