// Account helpers for the org and register functions: Supabase Auth with the service role.
// "Switched off" in PocketBase (active = false, refused at sign-in) is a ban on the Auth user
// here, plus ending their sessions; the profile keeps active / pending_approval for the app.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import { sql } from './core.ts'

export const authAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false }
}).auth.admin

const FOREVER = '876000h' // 100 years

/** Lets the account sign in, or not. Turning it off also ends every open session. */
export async function setCanSignIn(userId: string, can: boolean) {
  const { error } = await authAdmin.updateUserById(userId, { ban_duration: can ? 'none' : FOREVER })
  if (error) throw new Error(`auth ban: ${error.message}`)
  if (!can) await signOutEverywhere(userId)
}

/** Ends all of a person's sessions (their refresh tokens go with them). */
export async function signOutEverywhere(userId: string) {
  await sql`delete from auth.sessions where user_id = ${userId}`
}

export async function emailTaken(email: string): Promise<boolean> {
  const [row] = await sql`select 1 from auth.users where lower(email) = ${email.toLowerCase()} limit 1`
  return !!row
}

/** Creates an Auth user (email confirmed) and returns its id; the profile row comes from a trigger. */
export async function createAccount(email: string, password: string, fullName: string, banned: boolean): Promise<string> {
  const { data, error } = await authAdmin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    ...(banned ? { ban_duration: FOREVER } : {})
  })
  if (error || !data.user) throw new Error(`auth create: ${error?.message}`)
  return data.user.id
}
