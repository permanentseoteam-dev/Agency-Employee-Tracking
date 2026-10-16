// "Create an account" on the sign-in page (was register.pb.js). Open to guests (deployed with
// --no-verify-jwt). The new account starts switched off and waiting for an admin: it can't sign
// in until approved (org: approve). Role, team, salary and status are set here, never taken from
// the request. At most 5 sign-ups a minute per visitor address.
// { email, full_name, password, phone? } → { id }
import org from '../_shared/logic/org.js'
import { badRequest, body, HttpError, json, serve, sql } from '../_shared/core.ts'
import { authAdmin, createAccount, emailTaken } from '../_shared/accounts.ts'

serve(async (req) => {
  // The visitor's address: the first X-Forwarded-For entry. Supabase's edge puts the real address
  // first, so a forged header doesn't get round the limit (tried on staging: the 6th request was refused).
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const [recent] = await sql`select count(*)::int as n from register_attempts where ip = ${ip} and at > now() - interval '1 minute'`
  if (recent.n >= 5) throw new HttpError(429, 'Too many sign-ups from here. Wait a minute and try again.')
  // And at most 60 attempts an hour from everyone together, so many addresses can't flood the admins.
  const [all] = await sql`select count(*)::int as n from register_attempts where at > now() - interval '1 hour'`
  if (all.n >= 60) throw new HttpError(429, 'Too many sign-ups right now. Try again in an hour, or ask your admin to add you.')
  await sql`insert into register_attempts (ip) values (${ip})`
  await sql`delete from register_attempts where at < now() - interval '1 day'`

  const r = org.validateRegister(await body(req))
  if (r.error) throw badRequest(r.error)
  const d = r.data
  if (await emailTaken(d.email)) {
    throw badRequest('An account with this email already exists. Sign in instead, or ask your admin to reset your password.')
  }

  const id = await createAccount(d.email, d.password, d.full_name, true) // banned until approved
  try {
    await sql.begin(async (tx) => {
      await tx`update profiles set full_name = ${d.full_name}, phone = ${d.phone}, role = 'employee', team = null,
        joined_on = '', active = false, pending_approval = true, must_change_password = false where id = ${id}`
      await tx`insert into salaries ("user", monthly_salary_pkr) values (${id}, 0)` // 0 = not set yet
    })
  } catch (err) {
    await authAdmin.deleteUser(id)
    throw err
  }

  // Tell every active admin. A failure here never undoes the account.
  try {
    for (const a of await sql`select id from profiles where role = 'admin' and active`) {
      await sql`insert into notifications ("user", type, payload)
        values (${a.id}, 'signup_pending', ${sql.json({ user: id, name: d.full_name, email: d.email })})`
    }
  } catch (err) {
    console.error('register: notifying the admins', err)
  }
  return json(200, { id })
})
