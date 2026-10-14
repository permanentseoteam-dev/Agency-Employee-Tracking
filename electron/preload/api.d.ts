export interface TrackerApi {
  logError(message: string): void
}

declare global {
  interface Window {
    tracker: TrackerApi
  }
}
