// Switch role: an admin views the app as another person (POST /api/org/switch-to, admins
// only). The admin's own sign-in is kept here so "Back to me" needs no password and the
// tracker keeps recording the admin's time. Same trust level as the saved session
// (localStorage, which the SDK already uses).
import type { UserRecord } from './pb'

export interface HomeAccount {
  token: string
  record: UserRecord
}

const KEY = 'pseo.homeAccount'

export function loadHome(): HomeAccount | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return parsed && typeof parsed.token === 'string' && parsed.record?.id ? parsed : null
  } catch {
    return null
  }
}

export function saveHome(home: HomeAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(home))
  } catch {
    // Storage blocked: "Back to me" then needs a normal sign-in.
  }
}

export function clearHome(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

/** Viewing as someone else: there is a saved admin, and it isn't the signed-in account. */
export function viewingAs(home: HomeAccount | null, currentId: string | undefined): boolean {
  return !!home && !!currentId && home.record.id !== currentId
}

/** People to switch to, grouped admin → manager → employee, by name; switched-off and waiting ones left out. */
export function switchTargets<T extends Pick<UserRecord, 'id' | 'role' | 'full_name' | 'active'> & { pending_approval?: boolean }>(
  people: T[]
): T[] {
  const order = { admin: 0, manager: 1, employee: 2 }
  return people
    .filter((p) => p.active && !p.pending_approval)
    .sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || a.full_name.localeCompare(b.full_name))
}
