import { useState } from 'react'
import { ConnectionGate } from './ConnectionGate'
import { Login } from './Login'
import { Register } from './Register'

/** What the Gate shows to someone signed out: sign in, or create an account, once this PC can reach the server. */
export function SignedOut() {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in')
  return (
    <ConnectionGate>
      {mode === 'register' ? <Register onSignIn={() => setMode('sign-in')} /> : <Login onRegister={() => setMode('register')} />}
    </ConnectionGate>
  )
}
