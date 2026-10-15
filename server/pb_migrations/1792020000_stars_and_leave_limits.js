/// <reference path="../pb_data/types.d.ts" />
// Stars replace the late penalty, and Rules get leave limits per month:
// - org_settings: late_penalty_pkr goes; monthly_full_leaves and monthly_half_leaves
//   (0 = no limit) come in. payroll_items.late_count goes with the late penalty.
// - star_rules: the rule breaks and how many stars each one gives. Everyone reads them;
//   only admins change them. The three automatic ones come from attendance statuses.
// - star_records: stars an admin gives by hand, and excuses for automatic ones.

const AUTH = '@request.auth.id != ""'
const ADMIN = '@request.auth.role = "admin"'
const STAFF =
  '(@request.auth.role = "admin" || (@request.auth.role = "manager" && user.team.manager = @request.auth.id))'
const OWN_OR_STAFF = `(user = @request.auth.id || ${STAFF})`
const DATE_KEY = '^\\d{4}-\\d{2}-\\d{2}$'

const timestamps = () => [
  { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
]

const AUTO_RULES = [
  { name: 'Late arrival', auto: 'late', description: 'First activity after the shift start plus the grace period (attendance: Late).' },
  { name: 'Absent without leave', auto: 'absent', description: 'A working day with no activity and no approved leave (attendance: Absent).' },
  { name: 'Short hours', auto: 'half_day', description: 'Active for less than the half-day hours (attendance: Half day).' }
]

migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId('org_settings')
    settings.fields.removeByName('late_penalty_pkr')
    settings.fields.add(new NumberField({ name: 'monthly_full_leaves', min: 0, onlyInt: true }))
    settings.fields.add(new NumberField({ name: 'monthly_half_leaves', min: 0, onlyInt: true }))
    app.save(settings)

    const items = app.findCollectionByNameOrId('payroll_items')
    items.fields.removeByName('late_count')
    app.save(items)

    const users = app.findCollectionByNameOrId('users')
    const rules = new Collection({
      type: 'base',
      name: 'star_rules',
      listRule: AUTH,
      viewRule: AUTH,
      createRule: ADMIN,
      updateRule: ADMIN,
      deleteRule: ADMIN,
      fields: [
        { type: 'text', name: 'name', required: true, max: 100, presentable: true },
        { type: 'number', name: 'stars', min: 0, max: 100, onlyInt: true },
        { type: 'select', name: 'auto', maxSelect: 1, values: ['late', 'absent', 'half_day'] }, // empty = given by hand
        { type: 'text', name: 'description', max: 500 },
        ...timestamps()
      ],
      indexes: ['CREATE UNIQUE INDEX idx_star_rules_name ON star_rules (name)']
    })
    app.save(rules)
    for (const r of AUTO_RULES) {
      const rec = new Record(rules)
      rec.set('name', r.name)
      rec.set('stars', 0)
      rec.set('auto', r.auto)
      rec.set('description', r.description)
      app.save(rec)
    }

    app.save(
      new Collection({
        type: 'base',
        name: 'star_records',
        listRule: OWN_OR_STAFF,
        viewRule: OWN_OR_STAFF,
        createRule: ADMIN,
        updateRule: null,
        deleteRule: ADMIN,
        fields: [
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { type: 'relation', name: 'rule', required: true, collectionId: rules.id, maxSelect: 1, cascadeDelete: true },
          { type: 'text', name: 'date', required: true, pattern: DATE_KEY },
          { type: 'text', name: 'note', max: 500 },
          { type: 'relation', name: 'given_by', collectionId: users.id, maxSelect: 1 },
          { type: 'bool', name: 'excused' }, // cancels an automatic rule's stars on that day
          ...timestamps()
        ],
        indexes: ['CREATE UNIQUE INDEX idx_star_records_user_rule_date ON star_records (user, rule, date)']
      })
    )
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('star_records'))
    app.delete(app.findCollectionByNameOrId('star_rules'))

    const items = app.findCollectionByNameOrId('payroll_items')
    items.fields.add(new NumberField({ name: 'late_count', min: 0, onlyInt: true }))
    app.save(items)

    const settings = app.findCollectionByNameOrId('org_settings')
    settings.fields.removeByName('monthly_full_leaves')
    settings.fields.removeByName('monthly_half_leaves')
    settings.fields.add(new NumberField({ name: 'late_penalty_pkr', min: 0, onlyInt: true }))
    app.save(settings)
    for (const rec of app.findRecordsByFilter('org_settings', '', '', 0, 0)) {
      rec.set('late_penalty_pkr', 500)
      app.save(rec)
    }
  }
)
