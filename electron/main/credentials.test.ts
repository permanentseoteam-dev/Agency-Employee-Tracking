import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stand-ins: a pretend Windows encryption (reversible, so the test can read it back) and an
// in-memory store, so nothing touches this PC's real app data.
const memory = vi.hoisted(() => ({ saved: null as unknown, encryption: true }))
vi.mock('electron', () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: async () => memory.encryption,
    encryptStringAsync: async (text: string) => Buffer.from(`enc:${text}`),
    decryptStringAsync: async (data: Buffer) => ({ result: data.toString().replace(/^enc:/, '') })
  }
}))
vi.mock('./store', () => ({
  persisted: () => ({ get: () => memory.saved, set: (_key: string, value: unknown) => (memory.saved = value) })
}))
vi.mock('./log', () => ({ log: { warn: () => {} } }))

const { clearLogin, loadLogin, saveLogin } = await import('./credentials')

describe('Remember me: the sign-in kept on this PC', () => {
  beforeEach(() => {
    memory.saved = null
    memory.encryption = true
  })

  it('keeps the email and the password, never the password in plain text', async () => {
    await saveLogin('dummy@example.test', 'dummy-pass-123')
    expect(JSON.stringify(memory.saved)).not.toContain('dummy-pass-123')
    expect(await loadLogin()).toEqual({ email: 'dummy@example.test', password: 'dummy-pass-123' })
  })

  it('forgets it all when Remember me is off', async () => {
    await saveLogin('dummy@example.test', 'dummy-pass-123')
    clearLogin()
    expect(await loadLogin()).toBeNull()
  })

  it('without Windows encryption it keeps only the email', async () => {
    memory.encryption = false
    await saveLogin('dummy@example.test', 'dummy-pass-123')
    expect(await loadLogin()).toEqual({ email: 'dummy@example.test', password: '' })
  })

  it('has nothing to fill in before the first sign-in', async () => {
    expect(await loadLogin()).toBeNull()
  })
})
