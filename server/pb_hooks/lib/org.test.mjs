import { describe, expect, it } from 'vitest'
import org from './org.js'

const valid = {
  email: ' Ali@Example.com ',
  full_name: ' Ali Khan ',
  password: 'temp-pass-1',
  team: 'abc',
  role: 'employee',
  joined_on: '2026-10-14',
  monthly_salary_pkr: 85000
}

describe('validateInvite', () => {
  it('normalizes a valid form', () => {
    const { data, error } = org.validateInvite(valid)
    expect(error).toBeUndefined()
    expect(data.email).toBe('ali@example.com')
    expect(data.full_name).toBe('Ali Khan')
    expect(data.monthly_salary_pkr).toBe(85000)
  })

  it.each([
    [{ full_name: '' }, 'full name'],
    [{ email: 'not-an-email' }, 'valid email'],
    [{ password: 'short' }, 'at least 8'],
    [{ role: 'owner' }, 'valid role'],
    [{ joined_on: '2026-02-30' }, 'joining date'],
    [{ monthly_salary_pkr: -1 }, 'monthly salary'],
    [{ monthly_salary_pkr: 1000.5 }, 'monthly salary']
  ])('rejects %o', (patch, message) => {
    expect(org.validateInvite({ ...valid, ...patch }).error).toContain(message)
  })

  it('defaults role, salary and joining date', () => {
    const { data } = org.validateInvite({ ...valid, role: '', monthly_salary_pkr: '', joined_on: '' })
    expect(data.role).toBe('employee')
    expect(data.monthly_salary_pkr).toBe(0)
    expect(data.joined_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('validateSetActive', () => {
  it('deactivates with a leaving date', () => {
    expect(org.validateSetActive({ userId: 'u2', active: false, left_on: '2026-10-31' }, 'u1').data).toEqual({
      userId: 'u2',
      active: false,
      left_on: '2026-10-31'
    })
  })

  it('stops admins deactivating themselves', () => {
    expect(org.validateSetActive({ userId: 'u1', active: false }, 'u1').error).toContain('your own account')
  })

  it('clears the leaving date on reactivation', () => {
    expect(org.validateSetActive({ userId: 'u2', active: true, left_on: '2026-10-31' }, 'u1').data.left_on).toBe('')
  })
})

describe('todayKey', () => {
  it('uses Karachi time (UTC+5)', () => {
    expect(org.todayKey(300, Date.parse('2026-10-14T19:30:00Z'))).toBe('2026-10-15')
    expect(org.todayKey(300, Date.parse('2026-10-14T18:59:00Z'))).toBe('2026-10-14')
  })
})
