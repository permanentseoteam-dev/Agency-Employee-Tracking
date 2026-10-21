// "Remember me" on the sign-in screen also keeps the sign-in on this PC, so it is filled in after
// Log out: the email in plain text, the password encrypted by Windows for this Windows user
// (Electron safeStorage / DPAPI) and kept in tracker.json. Nothing is saved when encryption isn't
// available; the email alone still is. Signing in with Remember me off forgets both.
import { safeStorage } from 'electron'
import type { SavedLogin } from '../preload/api'
import { log } from './log'
import { persisted } from './store'

export async function loadLogin(): Promise<SavedLogin | null> {
  const saved = persisted().get('savedLogin')
  if (!saved?.email) return null
  let password = ''
  if (saved.password) {
    try {
      password = (await safeStorage.decryptStringAsync(Buffer.from(saved.password, 'base64'))).result
    } catch (err) {
      log.warn(`saved password could not be read: ${(err as Error).message}`)
    }
  }
  return { email: saved.email, password }
}

export async function saveLogin(email: string, password: string): Promise<void> {
  let encrypted = ''
  try {
    if (password && (await safeStorage.isAsyncEncryptionAvailable())) {
      encrypted = (await safeStorage.encryptStringAsync(password)).toString('base64')
    }
  } catch (err) {
    log.warn(`password not saved: ${(err as Error).message}`)
  }
  persisted().set('savedLogin', { email, password: encrypted })
}

export function clearLogin(): void {
  persisted().set('savedLogin', null)
}
