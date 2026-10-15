// Accounts that have signed in on this PC, so Switch account moves between them in one
// click. Each keeps its own PocketBase token, kept like the current session's token
// (localStorage, which the SDK already uses). A token the server refuses marks the
// account "needs password"; Forget removes it. Pure list helpers, then storage.
import type { Role, UserRecord } from './pb'

export interface RememberedAccount {
  id: string
  email: string
  full_name: string
  role: Role
  token: string
  record: UserRecord
  /** The saved token stopped working (expired, password changed, switched off): sign in again. */
  needsPassword: boolean
  lastUsed: number
}

const KEY = 'pseo.rememberedAccounts'
/** More than enough for one PC; the oldest drop off. */
const MAX = 12

/** Adds or refreshes an account and puts it first. */
export function rememberIn(list: RememberedAccount[], account: RememberedAccount): RememberedAccount[] {
  return [account, ...list.filter((a) => a.id !== account.id)].slice(0, MAX)
}

export function forgetIn(list: RememberedAccount[], id: string): RememberedAccount[] {
  return list.filter((a) => a.id !== id)
}

export function markIn(list: RememberedAccount[], id: string, patch: Partial<RememberedAccount>): RememberedAccount[] {
  return list.map((a) => (a.id === id ? { ...a, ...patch } : a))
}

/** The accounts to switch to: everyone but the signed-in one, most recently used first. */
export function othersIn(list: RememberedAccount[], currentId: string | undefined): RememberedAccount[] {
  return list.filter((a) => a.id !== currentId).sort((a, b) => b.lastUsed - a.lastUsed)
}

export function accountFrom(record: UserRecord, token: string, now = Date.now()): RememberedAccount {
  return {
    id: record.id,
    email: record.email ?? '',
    full_name: record.full_name,
    role: record.role,
    token,
    record,
    needsPassword: false,
    lastUsed: now
  }
}

function isAccount(value: unknown): value is RememberedAccount {
  const a = value as RememberedAccount
  return !!a && typeof a.id === 'string' && typeof a.token === 'string' && !!a.record && typeof a.record === 'object'
}

export function loadAccounts(): RememberedAccount[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isAccount) : []
  } catch {
    return []
  }
}

function save(list: RememberedAccount[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage blocked or full: switching falls back to the password form.
  }
}

export function remember(record: UserRecord, token: string): void {
  save(rememberIn(loadAccounts(), accountFrom(record, token)))
}

/** A fresh token for an account that isn't signed in right now (keeps its place in the list). */
export function updateAccount(record: UserRecord, token: string): void {
  save(markIn(loadAccounts(), record.id, { token, record, email: record.email ?? '', full_name: record.full_name, role: record.role, needsPassword: false }))
}

export function forget(id: string): void {
  save(forgetIn(loadAccounts(), id))
}

export function markNeedsPassword(id: string): void {
  save(markIn(loadAccounts(), id, { needsPassword: true, token: '' }))
}
