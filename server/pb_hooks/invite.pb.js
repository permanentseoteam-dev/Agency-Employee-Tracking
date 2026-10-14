/// <reference path="../pb_data/types.d.ts" />
// Organization routes (plan §4.7). Admin-only; the API rules keep users.create
// locked, so these are the only way accounts are created or switched off.
// Each handler runs in its own isolated context: helpers come from require()
// inside the handler, never from this file's top level.

// Add an employee with a temporary password, plus their salary record.
routerAdd(
  'POST',
  '/api/org/invite',
  (e) => {
    const org = require(`${__hooks}/lib/org.js`)
    org.requireAdmin(e)
    const result = org.validateInvite(e.requestInfo().body)
    if (result.error) throw new BadRequestError(result.error)
    const d = result.data

    let exists = false
    try {
      e.app.findAuthRecordByEmail('users', d.email)
      exists = true
    } catch (_) {}
    if (exists) throw new BadRequestError('An account with this email already exists.')

    if (d.team) {
      try {
        e.app.findRecordById('teams', d.team)
      } catch (_) {
        throw new BadRequestError('That team no longer exists.')
      }
    }

    let id = ''
    e.app.runInTransaction((txApp) => {
      const user = new Record(txApp.findCollectionByNameOrId('users'))
      user.setEmail(d.email)
      user.setPassword(d.password)
      user.set('full_name', d.full_name)
      user.set('team', d.team)
      user.set('role', d.role)
      user.set('designation', d.designation)
      user.set('phone', d.phone)
      user.set('joined_on', d.joined_on)
      user.set('active', true)
      user.set('must_change_password', true)
      txApp.save(user)

      const salary = new Record(txApp.findCollectionByNameOrId('salaries'))
      salary.set('user', user.id)
      salary.set('monthly_salary_pkr', d.monthly_salary_pkr)
      txApp.save(salary)
      id = user.id
    })

    return e.json(200, { id: id })
  },
  $apis.requireAuth('users')
)

// Set a new temporary password; the employee must change it at the next login.
routerAdd(
  'POST',
  '/api/org/reset-password',
  (e) => {
    const org = require(`${__hooks}/lib/org.js`)
    org.requireAdmin(e)
    const body = e.requestInfo().body || {}
    const problem = org.passwordProblem(body.password)
    if (problem) throw new BadRequestError(problem)

    let user
    try {
      user = e.app.findRecordById('users', String(body.userId || ''))
    } catch (_) {
      throw new NotFoundError('Employee not found.')
    }
    user.setPassword(body.password) // also signs them out everywhere
    user.set('must_change_password', true)
    e.app.save(user)
    return e.json(200, { id: user.id })
  },
  $apis.requireAuth('users')
)

// Deactivate (records the leaving date and signs them out everywhere) or reactivate.
routerAdd(
  'POST',
  '/api/org/set-active',
  (e) => {
    const org = require(`${__hooks}/lib/org.js`)
    const admin = org.requireAdmin(e)
    const result = org.validateSetActive(e.requestInfo().body, admin.id)
    if (result.error) throw new BadRequestError(result.error)
    const d = result.data

    let user
    try {
      user = e.app.findRecordById('users', d.userId)
    } catch (_) {
      throw new NotFoundError('Employee not found.')
    }
    user.set('active', d.active)
    user.set('left_on', d.left_on)
    if (!d.active) user.refreshTokenKey()
    e.app.save(user)
    return e.json(200, { id: user.id, active: d.active })
  },
  $apis.requireAuth('users')
)
