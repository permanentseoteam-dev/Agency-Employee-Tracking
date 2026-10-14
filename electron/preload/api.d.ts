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

export interface TrackerApi {
  logError(message: string): void
  setSession(session: SessionInfo | null): void
  getAutostart(): Promise<AutostartState>
  setAutostart(enabled: boolean): Promise<AutostartState>
  openLogsFolder(): Promise<void>
}

declare global {
  interface Window {
    tracker: TrackerApi
  }
}
