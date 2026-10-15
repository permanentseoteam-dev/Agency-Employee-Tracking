/// <reference path="../pb_data/types.d.ts" />
// Switch role (admins only): signs the app in as another active account without its
// password, so an admin sees the app exactly as that person does. Only an admin may
// call this (the server is on the internet: anyone else could make themselves admin).
// The app keeps the admin's own token to come back and to keep tracking the admin's time.

routerAdd(
  'POST',
  '/api/org/switch-to',
  (e) => {
    const org = require(`${__hooks}/lib/org.js`)
    const admin = org.requireAdmin(e)
    const body = e.requestInfo().body || {}
    const id = typeof body.userId === 'string' ? body.userId.trim() : ''
    if (!id) throw new BadRequestError('Pick a person.')
    let user = null
    try {
      user = e.app.findRecordById('users', id)
    } catch (_) {}
    if (!user) throw new NotFoundError('That person no longer exists.')
    if (!user.getBool('active') || user.getBool('pending_approval')) {
      throw new BadRequestError('That account is switched off or waiting for approval.')
    }
    e.app.logger().info('switch role', 'admin', admin.id, 'to', user.id)
    return $apis.recordAuthResponse(e, user, 'switch', null)
  },
  $apis.requireAuth('users')
)
