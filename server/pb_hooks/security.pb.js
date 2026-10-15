/// <reference path="../pb_data/types.d.ts" />
// The server is reachable from the internet through Tailscale Funnel (only /api).
// Funnel adds X-Forwarded-For to every request it carries; requests made on this PC
// (the dashboard at http://127.0.0.1:8090/_/) and over the private network don't
// have it. Superusers (the dashboard login) may only sign in and act from here.
// Each handler runs in its own isolated context, so the check is inlined.

onRecordAuthRequest((e) => {
  const h = e.requestInfo().headers || {} // lowercase names, '-' as '_'
  const forwarded = h['x_forwarded_for'] || h['x_forwarded_host']
  if (forwarded) throw new ForbiddenError('The database dashboard can only be used on the server PC.')
  e.next()
}, '_superusers')

routerUse((e) => {
  const h = e.requestInfo().headers || {} // lowercase names, '-' as '_'
  const forwarded = h['x_forwarded_for'] || h['x_forwarded_host']
  if (forwarded && e.auth && e.auth.isSuperuser()) {
    throw new ForbiddenError('The database dashboard can only be used on the server PC.')
  }
  return e.next()
})
