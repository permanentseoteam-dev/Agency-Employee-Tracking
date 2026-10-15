/// <reference path="../pb_data/types.d.ts" />
// Before the server is reachable from the internet (Tailscale Funnel on /api):
// - users.pending_approval: "Create an account" makes an inactive account that waits for
//   an admin (POST /api/org/approve or /reject). Nobody can set the flag on themselves.
// - Rate limits per visitor: 5 sign-ups and 30 sign-ins a minute. Funnel forwards the
//   visitor's address in X-Forwarded-For; the rightmost entry is the one it added.

const SELF_LOCK = '@request.body.left_on:isset = false)'

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(new BoolField({ name: 'pending_approval' }))
    if (users.updateRule.indexOf(SELF_LOCK) === -1) throw new Error('users.updateRule has an unexpected form')
    users.updateRule = users.updateRule.replace(SELF_LOCK, '@request.body.left_on:isset = false && @request.body.pending_approval:isset = false)')
    app.save(users)

    const s = app.settings()
    unmarshal(
      {
        trustedProxy: { headers: ['X-Forwarded-For'], useLeftmostIP: false },
        rateLimits: {
          enabled: true,
          rules: [
            { label: 'POST /api/register', audience: '@guest', duration: 60, maxRequests: 5 },
            { label: '*:auth', audience: '@guest', duration: 60, maxRequests: 30 }
          ]
        }
      },
      s
    )
    app.save(s)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.updateRule = users.updateRule.replace(' && @request.body.pending_approval:isset = false)', ')')
    users.fields.removeByName('pending_approval')
    app.save(users)

    const s = app.settings()
    unmarshal(
      {
        trustedProxy: { headers: [], useLeftmostIP: false },
        rateLimits: { enabled: true, rules: [{ label: 'POST /api/register', audience: '@guest', duration: 60, maxRequests: 5 }] }
      },
      s
    )
    app.save(s)
  }
)
