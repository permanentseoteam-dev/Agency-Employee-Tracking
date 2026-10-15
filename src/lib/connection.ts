// What the sign-in screen tells someone whose PC can't reach the server right now
// (ConnectionGate). The server has a public internet address, so this only happens
// when the PC is offline or the server PC is off. Pure, so it is unit-tested.

export type NetworkStatus = Awaited<ReturnType<Window['tracker']['networkStatus']>>

export interface ConnectionMessage {
  kind: 'ok' | 'offline'
  title: string
  text: string
}

export function connectionMessage(s: NetworkStatus): ConnectionMessage {
  if (s.server) return { kind: 'ok', title: '', text: '' }
  return {
    kind: 'offline',
    title: 'Can’t reach the server',
    text: 'Check this PC’s internet connection. If the internet works, the server PC may be switched off or restarting. This screen keeps trying and opens sign-in by itself.'
  }
}
