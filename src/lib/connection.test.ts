import { describe, expect, it } from 'vitest'
import { connectionMessage } from './connection'

describe('connectionMessage', () => {
  it('lets people in when the server answers, whatever Tailscale says', () => {
    expect(connectionMessage({ server: true, tailscale: 'missing', onAgencyNetwork: false }).kind).toBe('ok')
  })

  it.each([['missing'], ['stopped'], ['signed_out']] as const)('Tailscale %s → run the office setup file', (tailscale) => {
    const m = connectionMessage({ server: false, tailscale, onAgencyNetwork: false })
    expect(m.kind).toBe('not_connected')
    expect(m.text).toContain('office setup file')
  })

  it('another Tailscale account → the office setup file moves the PC', () => {
    const m = connectionMessage({ server: false, tailscale: 'running', onAgencyNetwork: false })
    expect(m.kind).toBe('other_network')
    expect(m.text).toContain('different account')
  })

  it('on the agency network but no answer → the server PC is off', () => {
    const m = connectionMessage({ server: false, tailscale: 'running', onAgencyNetwork: true })
    expect(m.kind).toBe('server_down')
    expect(m.text).toContain('switched off')
  })
})
