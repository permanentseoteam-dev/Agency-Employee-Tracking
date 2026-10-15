/// <reference path="../pb_data/types.d.ts" />
// "Create an account" (register.pb.js) is open to guests, so limit it to 5
// registrations a minute per address. Only this rule: PocketBase's default rules
// (sign-in 2 per 3 s, the whole API 300 per 10 s) would also slow down sign-ins,
// the trackers' catch-up syncs and the test suites.

migrate(
  (app) => {
    const s = app.settings()
    unmarshal(
      {
        rateLimits: {
          enabled: true,
          rules: [{ label: 'POST /api/register', audience: '@guest', duration: 60, maxRequests: 5 }]
        }
      },
      s
    )
    app.save(s)
  },
  (app) => {
    const s = app.settings()
    unmarshal({ rateLimits: { enabled: false, rules: [] } }, s)
    app.save(s)
  }
)
