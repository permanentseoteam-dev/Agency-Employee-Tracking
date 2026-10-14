export interface SessionInfo {
  token: string
  userId: string
  role: string
}

export interface AutostartState {
  /** False in development, where registering electron.exe at login would be wrong. */
  supported: boolean
  enabled: boolean
}

/** The org rules the tracker needs (a copy of the org_settings record). */
export interface TrackerSettings {
  shift_start: string
  shift_end: string
  work_days: number[]
  idle_threshold_minutes: number
  timezone: string
}

export interface TrackerApi {
  logError(message: string): void
  setSession(session: SessionInfo | null): void
  setSettings(settings: TrackerSettings): void
  getAutostart(): Promise<AutostartState>
  setAutostart(enabled: boolean): Promise<AutostartState>
  openLogsFolder(): Promise<void>
}

declare global {
  interface Window {
    tracker: TrackerApi
  }
}
