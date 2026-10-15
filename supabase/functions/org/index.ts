// Organization actions, admins only (was invite.pb.js and switch.pb.js). { action, ... }:
//   invite          { email, full_name, password, team, role, designation, phone, joined_on, monthly_salary_pkr } → { id }
//   reset-password  { userId, password } → { id }   (temporary password; must change it; signed out everywhere)
//   set-active      { userId, active, left_on? } → { id, active }   (deactivating records the leaving date)
//   approve         { userId, joined_on? } → { id }   (a "Create an account" sign-up)
//   reject          { userId } → { id }   (deletes the waiting account)
//   switch-to       { userId } → { session, record }   (Switch role: sign in as that person, no password)
import org from '../_shared/logic/org.js'
import { badRequest, body, caller, forbidden, HttpError, json, notFound, serve, sql } from '../_shared/core.ts'
import { authAdmin, createAccount, emailTaken, setCanSignIn, signOutEverywhere } from '../_shared/accounts.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const profile = async (id: string) => (await sql`select * from profiles where id = ${id}`)[0]

serve(async (req) => {
  const me = await caller(req)
  if (me.role !== 'admin') throw forbidden('Only admins can do this.')
  const b = await body(req)

  switch (b.action) {
    case 'invite': {
      const r = org.validateInvite(b)
      if (r.error) throw badRequest(r.error)
      const d = r.data
      if (await emailTaken(d.email)) throw badRequest('An account with this email already exists.')
      if (d.team && !(await sql`select 1 from teams where id = ${d.team}`).length) throw badRequest('That team no longer exists.')
      const id = await createAccount(d.email, d.password, d.full_name, false)
      try {
        await sql.begin(async (tx) => {
          await tx`update profiles set full_name = ${d.full_name}, team = ${d.team || null}, role = ${d.role}, designation = ${d.designation},
            phone = ${d.phone}, joined_on = ${d.joined_on}, active = true, must_change_password = true where id = ${id}`
          await tx`insert into salaries ("user", monthly_salary_pkr) values (${id}, ${d.monthly_salary_pkr})`
        })
      } catch (err) {
        await authAdmin.deleteUser(id) // all or nothing, like the PocketBase transaction
        throw err
      }
      return json(200, { id })
    }

    case 'reset-password': {
      const problem = org.passwordProblem(b.password)
      if (problem) throw badRequest(problem)
      const p = await profile(String(b.userId ?? ''))
      if (!p) throw notFound('Employee not found.')
      const { error } = await authAdmin.updateUserById(p.id, { password: String(b.password) })
      if (error) throw badRequest(error.message)
      await sql`update profiles set must_change_password = true where id = ${p.id}`
      await signOutEverywhere(p.id)
      return json(200, { id: p.id })
    }

    case 'set-active': {
      const r = org.validateSetActive(b, me.id)
      if (r.error) throw badRequest(r.error)
      const p = await profile(r.data.userId)
      if (!p) throw notFound('Employee not found.')
      if (p.pending_approval) throw badRequest('This account is waiting for approval: approve or reject it.')
      await sql`update profiles set active = ${r.data.active}, left_on = ${r.data.left_on} where id = ${p.id}`
      await setCanSignIn(p.id, r.data.active)
      return json(200, { id: p.id, active: r.data.active })
    }

    case 'approve': {
      const r = org.validateApprove(b)
      if (r.error) throw badRequest(r.error)
      const p = await profile(r.data.userId)
      if (!p) throw notFound('Employee not found.')
      if (!p.pending_approval) throw badRequest('This account is not waiting for approval.')
      await sql`update profiles set active = true, pending_approval = false, joined_on = ${r.data.joined_on}, left_on = '' where id = ${p.id}`
      await setCanSignIn(p.id, true)
      return json(200, { id: p.id })
    }

    case 'reject': {
      const p = await profile(String(b.userId ?? ''))
      if (!p) throw notFound('Employee not found.')
      if (!p.pending_approval) throw badRequest('Only accounts waiting for approval can be rejected.')
      const { error } = await authAdmin.deleteUser(p.id) // the profile and salary go with it
      if (error) throw badRequest(error.message)
      return json(200, { id: p.id })
    }

    case 'switch-to': {
      const id = typeof b.userId === 'string' ? b.userId.trim() : ''
      if (!id) throw badRequest('Pick a person.')
      const p = await profile(id)
      if (!p) throw notFound('That person no longer exists.')
      if (!p.active || p.pending_approval) throw badRequest('That account is switched off or waiting for approval.')
      const { data: user } = await authAdmin.getUserById(id)
      const email = user?.user?.email
      if (!email) throw notFound('That person no longer exists.')
      // A one-time sign-in link for that person, redeemed right here for a session.
      const { data: link, error } = await authAdmin.generateLink({ type: 'magiclink', email })
      if (error || !link.properties?.hashed_token) throw new HttpError(500, 'Could not switch: ' + (error?.message ?? 'no link'))
      const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
      const { data: verified, error: vErr } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
      if (vErr || !verified.session) throw new HttpError(500, 'Could not switch: ' + (vErr?.message ?? 'no session'))
      console.log(`switch role: admin ${me.id} → ${id}`)
      return json(200, { session: verified.session, record: p })
    }

    default:
      throw badRequest('Unknown action.')
  }
})
