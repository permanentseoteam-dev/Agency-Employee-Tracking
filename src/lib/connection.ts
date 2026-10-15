// What the sign-in screen tells someone whose PC can't reach the server yet
// (ConnectionGate). Pure, so it is unit-tested.

export type NetworkStatus = Awaited<ReturnType<Window['tracker']['networkStatus']>>

export interface ConnectionMessage {
  kind: 'ok' | 'not_connected' | 'other_network' | 'server_down'
  title: string
  text: string
}

export function connectionMessage(s: NetworkStatus): ConnectionMessage {
  if (s.server) return { kind: 'ok', title: '', text: '' }
  if (s.tailscale === 'running' && s.onAgencyNetwork) {
    return {
      kind: 'server_down',
      title: 'The server isn’t answering',
      text: 'This PC is on the agency network, but the server PC may be switched off or restarting. This screen keeps trying and unlocks by itself.'
    }
  }
  if (s.tailscale === 'running') {
    return {
      kind: 'other_network',
      title: 'This PC is on a different network',
      text: 'Tailscale on this PC is signed in to a different account, so it can’t reach the agency’s server. Run the office setup file from your admin (PSEO-Tracker-Office-Setup): it moves this PC to the agency network.'
    }
  }
  return {
    kind: 'not_connected',
    title: 'Connect this PC to the agency network first',
    text: 'This PC isn’t connected to the agency network yet. Run the office setup file you got from your admin (PSEO-Tracker-Office-Setup), then come back here. Sign-in and Create an account unlock by themselves.'
  }
}
