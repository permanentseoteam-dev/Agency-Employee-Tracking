import { describe, expect, it } from 'vitest'
import { generateTempPassword } from './password'

describe('generateTempPassword', () => {
  it('has the requested length and character mix', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword()
      expect(p).toHaveLength(10)
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[2-9]/)
      expect(p).not.toMatch(/[01OIl]/)
    }
  })

  it('differs between calls', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTempPassword()))
    expect(seen.size).toBe(50)
  })
})
