import { describe, expect, it } from 'vitest'
import { connectionMessage } from './connection'

describe('connectionMessage', () => {
  it('lets people in when the server answers, whatever Tailscale says', () => {
    expect(connectionMessage({ server: true, tailscale: 'missing', onAgencyNetwork: false }).kind).toBe('ok')
  })

  it.each([['missing'], ['stopped'], ['signed_out'], ['running']] as const)(
    'no server with Tailscale %s → check the internet; no Tailscale or setup file needed',
    (tailscale) => {
      const m = connectionMessage({ server: false, tailscale, onAgencyNetwork: false })
      expect(m.kind).toBe('offline')
      expect(m.text).toContain('internet connection')
      expect(m.text).not.toContain('office setup file')
      expect(m.text).not.toContain('Tailscale')
    }
  )
})
