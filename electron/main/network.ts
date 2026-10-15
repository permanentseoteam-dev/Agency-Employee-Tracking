// Can this PC reach the server, and what does its Tailscale say? For the sign-in
// screen's connection panel (ConnectionGate). Read-only: it never changes Tailscale.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { NetworkStatus } from '../preload/api'

const SERVER_URL = import.meta.env.VITE_PB_URL
/** The server's name on the agency network ("agency-server" in production builds). */
const SERVER_HOST = new URL(SERVER_URL).hostname.toLowerCase()

async function serverAnswers(): Promise<boolean> {
  try {
    const res = await fetch(new URL('/api/health', SERVER_URL), { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

interface TailscaleNode {
  HostName?: string
  DNSName?: string
}

function tailscaleState(): Promise<Pick<NetworkStatus, 'tailscale' | 'onAgencyNetwork'>> {
  const exe = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Tailscale', 'tailscale.exe')
  if (process.platform !== 'win32' || !existsSync(exe)) return Promise.resolve({ tailscale: 'missing', onAgencyNetwork: false })
  return new Promise((resolve) => {
    execFile(exe, ['status', '--json'], { timeout: 5000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (_err, stdout) => {
      try {
        const s = JSON.parse(stdout) as { BackendState?: string; Self?: TailscaleNode; Peer?: Record<string, TailscaleNode> }
        const backend = s.BackendState ?? ''
        const tailscale: NetworkStatus['tailscale'] =
          backend === 'Running' ? 'running' : backend === 'Stopped' || backend === '' ? 'stopped' : 'signed_out'
        const names = [s.Self, ...Object.values(s.Peer ?? {})].flatMap((n) => [n?.HostName ?? '', (n?.DNSName ?? '').split('.')[0]])
        resolve({ tailscale, onAgencyNetwork: tailscale === 'running' && names.some((x) => x.toLowerCase() === SERVER_HOST) })
      } catch {
        // No JSON: the Tailscale service isn't running.
        resolve({ tailscale: 'stopped', onAgencyNetwork: false })
      }
    })
  })
}

export async function networkStatus(): Promise<NetworkStatus> {
  const [server, ts] = await Promise.all([serverAnswers(), tailscaleState()])
  return { server, ...ts }
}
