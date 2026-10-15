import { describe, expect, it } from 'vitest'
import { connectionMessage } from './connection'

describe('connectionMessage', () => {
  it('lets people in when the server answers', () => {
    expect(connectionMessage({ server: true }).kind).toBe('ok')
  })

  it('no server → check the internet; nothing to install or set up', () => {
    const m = connectionMessage({ server: false })
    expect(m.kind).toBe('offline')
    expect(m.text).toContain('internet connection')
    expect(m.text).not.toContain('office setup file')
    expect(m.text).not.toContain('Tailscale')
  })
})
