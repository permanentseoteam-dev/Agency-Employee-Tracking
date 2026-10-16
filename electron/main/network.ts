// Can this PC reach the server (Supabase)? For the sign-in screen's connection panel (ConnectionGate).
import type { NetworkStatus } from '../preload/api'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export async function networkStatus(): Promise<NetworkStatus> {
  try {
    const res = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY }, signal: AbortSignal.timeout(8000) })
    return { server: res.ok }
  } catch {
    return { server: false }
  }
}
