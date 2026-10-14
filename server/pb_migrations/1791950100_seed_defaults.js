/// <reference path="../pb_data/types.d.ts" />
// Default org rules (plan.md §9) and leave types. Admins change them later in Rules.

migrate(
  (app) => {
    const settings = new Record(app.findCollectionByNameOrId('org_settings'))
    settings.set('shift_start', '09:00')
    settings.set('shift_end', '18:00')
    settings.set('work_days', [1, 2, 3, 4, 5]) // ISO weekdays, Mon–Fri
    settings.set('grace_minutes', 15)
    settings.set('full_day_min_hours', 8)
    settings.set('half_day_min_hours', 4)
    settings.set('idle_threshold_minutes', 5)
    settings.set('late_penalty_pkr', 500)
    settings.set('timezone', 'Asia/Karachi')
    app.save(settings)

    const leaveTypes = app.findCollectionByNameOrId('leave_types')
    for (const [name, quota] of [
      ['Sick', 8],
      ['Casual', 10],
      ['Annual', 14]
    ]) {
      const r = new Record(leaveTypes)
      r.set('name', name)
      r.set('yearly_quota_days', quota)
      r.set('paid', true)
      app.save(r)
    }

    // Daily backup at 02:00 PKT (21:00 UTC), after the 01:00 attendance cron; keep 14.
    const s = app.settings()
    s.backups.cron = '0 21 * * *'
    s.backups.cronMaxKeep = 14
    app.save(s)
  },
  (app) => {
    for (const name of ['org_settings', 'leave_types']) {
      for (const r of app.findAllRecords(name)) app.delete(r)
    }
    const s = app.settings()
    s.backups.cron = ''
    app.save(s)
  }
)
