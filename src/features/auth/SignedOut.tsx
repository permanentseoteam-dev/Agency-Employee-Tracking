import { useState } from 'react'
import { Login } from './Login'
import { Register } from './Register'

/** What the Gate shows to someone signed out: sign in, or create an account. */
export function SignedOut() {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in')
  return mode === 'register' ? <Register onSignIn={() => setMode('sign-in')} /> : <Login onRegister={() => setMode('register')} />
}
