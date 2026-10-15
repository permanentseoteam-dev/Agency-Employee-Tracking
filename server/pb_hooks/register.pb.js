/// <reference path="../pb_data/types.d.ts" />
// "Create an account" on the sign-in page. Open to guests: anyone who can reach
// the server (only devices on the agency's Tailscale) can register, and is an
// active employee at once. Role, team, joining date and salary are always set
// here, never taken from the request; the admins are notified so they can fill
// in the rest under Organization. The 1791990000_register_rate_limit migration
// allows 5 registrations a minute per address.
// Each handler runs in its own isolated context: helpers come from require().

routerAdd('POST', '/api/register', (e) => {
  const org = require(`${__hooks}/lib/org.js`)
  const result = org.validateRegister(e.requestInfo().body)
  if (result.error) throw new BadRequestError(result.error)
  const d = result.data

  let exists = false
  try {
    e.app.findAuthRecordByEmail('users', d.email)
    exists = true
  } catch (_) {}
  if (exists) {
    throw new BadRequestError('An account with this email already exists. Sign in instead, or ask your admin to reset your password.')
  }

  let id = ''
  e.app.runInTransaction((txApp) => {
    const user = new Record(txApp.findCollectionByNameOrId('users'))
    user.setEmail(d.email)
    user.setPassword(d.password)
    user.setVerified(true)
    user.set('full_name', d.full_name)
    user.set('phone', d.phone)
    user.set('role', 'employee')
    user.set('team', '')
    // Today, so attendance doesn't mark the days before they joined as absent.
    user.set('joined_on', org.todayKey())
    user.set('active', true)
    user.set('must_change_password', false) // they chose this password themselves
    txApp.save(user)

    // 0 = salary not set yet: payroll leaves them out and names them until an admin sets it.
    const salary = new Record(txApp.findCollectionByNameOrId('salaries'))
    salary.set('user', user.id)
    salary.set('monthly_salary_pkr', 0)
    txApp.save(salary)
    id = user.id
  })

  // Tell every active admin. A failure here is logged and never undoes the account.
  try {
    const collection = e.app.findCollectionByNameOrId('notifications')
    for (const admin of e.app.findRecordsByFilter('users', "role = 'admin' && active = true", '', 0, 0)) {
      const n = new Record(collection)
      n.set('user', admin.id)
      n.set('type', 'employee_registered')
      n.set('payload', { user: id, name: d.full_name, email: d.email })
      e.app.save(n)
    }
  } catch (err) {
    e.app.logger().error('register: notifying the admins', 'error', String(err))
  }

  return e.json(200, { id: id })
})
