// What the tray shows for a tracker status. Pure, so the menu rules are tested.
import { formatDuration } from '../../src/lib/format'
import type { TrackerStatus } from '../preload/api'

export type Tone = 'active' | 'idle' | 'off' | 'signedOut'

export interface TrayModel {
  tone: Tone
  today: string
  status: string
  pending: string
  /** Quit is for managers and admins only; employees can't stop the tracker. */
  canQuit: boolean
}

export function statusText(s: TrackerStatus): string {
  if (!s.signedIn && s.reason !== 'no_user') return 'Signed out – sign in to sync'
  switch (s.reason) {
    case 'tracking':
      return s.state === 'idle' ? 'Idle' : 'Active'
    case 'starting':
      return 'Starting…'
    case 'outside_shift':
      return 'Outside shift hours'
    case 'locked':
      return 'Paused – screen locked'
    case 'suspended':
      return 'Paused – sleeping'
    case 'no_consent':
      return 'Waiting for the tracking notice'
    case 'no_user':
      return 'Sign in to start tracking'
  }
}

export function trayModel(s: TrackerStatus): TrayModel {
  return {
    tone: !s.signedIn ? 'signedOut' : s.state === 'off' ? 'off' : s.state,
    today: `Today: ${formatDuration(s.today.active_s)} active · ${formatDuration(s.today.idle_s)} idle`,
    status: statusText(s),
    pending: s.pending > 0 ? `${s.pending} segment${s.pending === 1 ? '' : 's'} waiting to sync` : '',
    canQuit: s.role === 'manager' || s.role === 'admin'
  }
}
