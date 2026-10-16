// The Windows notifications about app updates (updater.ts). Pure, so it is unit-tested.

export interface Notice {
  title: string
  body: string
}

/** A new version is downloaded and installs right away: the app restarts by itself. */
export function updatingNotice(version: string): Notice {
  return {
    title: `Updating PSEO Tracker to ${version}`,
    body: 'The app restarts in about 10 seconds. Your tracked time is kept; nothing to do.'
  }
}

/** Shown once on the first start of a new version. */
export function updatedNotice(version: string): Notice {
  return { title: `PSEO Tracker updated to ${version}`, body: 'The new version is running. Nothing else to do.' }
}

/** Whether this start is the first one after an update (not a first install, not the same version). */
export function isFirstStartAfterUpdate(lastVersion: string | null, current: string): boolean {
  return !!lastVersion && lastVersion !== current
}
