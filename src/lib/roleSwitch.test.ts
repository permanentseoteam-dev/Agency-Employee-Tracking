import { describe, expect, it } from 'vitest'
import { switchTargets, viewingAs } from './roleSwitch'
import type { UserRecord } from './pb'

const person = (id: string, role: UserRecord['role'], full_name: string, extra: Partial<UserRecord> = {}) =>
  ({ id, role, full_name, active: true, ...extra }) as UserRecord

describe('switch role', () => {
  it('knows when the admin is viewing as someone else', () => {
    const home = { token: 't', record: person('admin1', 'admin', 'Ayesha') }
    expect(viewingAs(home, 'emp1')).toBe(true)
    expect(viewingAs(home, 'admin1')).toBe(false)
    expect(viewingAs(null, 'emp1')).toBe(false)
  })

  it('lists active people by role, then name, without switched-off or waiting accounts', () => {
    const list = switchTargets([
      person('e2', 'employee', 'Zainab'),
      person('m1', 'manager', 'Omar'),
      person('e1', 'employee', 'Ali'),
      person('a1', 'admin', 'Hamza'),
      person('x1', 'employee', 'Gone', { active: false }),
      person('p1', 'employee', 'New', { pending_approval: true })
    ])
    expect(list.map((p) => p.id)).toEqual(['a1', 'm1', 'e1', 'e2'])
  })
})
