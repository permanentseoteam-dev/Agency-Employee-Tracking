/// <reference path="../pb_data/types.d.ts" />
// Daily backup at 13:00 PKT (08:00 UTC) instead of 02:00. The server is an office PC
// that may be switched off at night, and PocketBase doesn't catch up on a missed run.
// Writes wait while the backup runs (it is taken inside a transaction); keep 14.

migrate(
  (app) => {
    const s = app.settings()
    s.backups.cron = '0 8 * * *'
    s.backups.cronMaxKeep = 14
    app.save(s)
  },
  (app) => {
    const s = app.settings()
    s.backups.cron = '0 21 * * *'
    app.save(s)
  }
)
