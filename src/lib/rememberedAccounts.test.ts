import { describe, expect, it } from 'vitest'
import { accountFrom, forgetIn, markIn, othersIn, rememberIn, type RememberedAccount } from './rememberedAccounts'
import type { UserRecord } from './pb'

const user = (id: string, role: UserRecord['role'] = 'employee'): UserRecord =>
  ({ id, email: `${id}@test.local`, full_name: id.toUpperCase(), role }) as UserRecord
const acc = (id: string, lastUsed: number, role: UserRecord['role'] = 'employee'): RememberedAccount =>
  accountFrom(user(id, role), `token-${id}`, lastUsed)

describe('remembered accounts', () => {
  it('remembers an account once, newest first, with a fresh token', () => {
    let list = rememberIn([], acc('asma', 1))
    list = rememberIn(list, acc('bilal', 2, 'manager'))
    list = rememberIn(list, { ...acc('asma', 3), token: 'newer' })
    expect(list.map((a) => a.id)).toEqual(['asma', 'bilal'])
    expect(list[0].token).toBe('newer')
    expect(list[0].needsPassword).toBe(false)
  })

  it('lists everyone but the signed-in account, most recently used first', () => {
    const list = [acc('asma', 5), acc('bilal', 9, 'manager'), acc('ayesha', 7, 'admin')]
    expect(othersIn(list, 'bilal').map((a) => a.id)).toEqual(['ayesha', 'asma'])
    expect(othersIn(list, undefined)).toHaveLength(3)
  })

  it('forgets an account and marks one that needs its password again', () => {
    const list = [acc('asma', 1), acc('bilal', 2)]
    expect(forgetIn(list, 'asma').map((a) => a.id)).toEqual(['bilal'])
    const marked = markIn(list, 'bilal', { needsPassword: true, token: '' })
    expect(marked[1]).toMatchObject({ id: 'bilal', needsPassword: true, token: '' })
    expect(marked[0].needsPassword).toBe(false)
  })

  it('keeps at most 12 accounts', () => {
    let list: RememberedAccount[] = []
    for (let i = 0; i < 15; i++) list = rememberIn(list, acc(`u${i}`, i))
    expect(list).toHaveLength(12)
    expect(list[0].id).toBe('u14')
  })
})
