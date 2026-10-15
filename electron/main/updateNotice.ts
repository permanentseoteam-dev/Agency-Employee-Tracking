// The Windows notifications about app updates (updater.ts). Pure, so it is unit-tested.

export interface Notice {
  title: string
  body: string
}

/** A new version is downloaded and waiting; clicking the notification installs it now. */
export function readyNotice(version: string): Notice {
  return {
    title: `PSEO Tracker ${version} is ready`,
    body: 'Click here to restart and update now (about 10 seconds; your tracked time is kept). Otherwise it updates by itself when you are not being tracked.'
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
