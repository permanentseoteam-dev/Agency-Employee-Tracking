// What the sign-in screen tells someone whose PC can't reach the server right now
// (ConnectionGate). The server is Supabase, on the internet, so this only happens when
// the PC is offline (or Supabase itself is down). Pure, so it is unit-tested.

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
    text: 'Check this PC’s internet connection. This screen keeps trying and opens sign-in by itself once the connection is back.'
  }
}
