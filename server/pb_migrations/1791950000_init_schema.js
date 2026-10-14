/// <reference path="../pb_data/types.d.ts" />
// PSEO Tracker schema (plan.md §5). Date-only values are "YYYY-MM-DD" text in
// the org timezone; instants (started_at, last_seen, …) are UTC date fields.

const AUTH = '@request.auth.id != ""'
const ADMIN = '@request.auth.role = "admin"'
// Admins see everyone; a manager sees people in the teams they manage.
const STAFF =
  '(@request.auth.role = "admin" || (@request.auth.role = "manager" && user.team.manager = @request.auth.id))'
const OWN = 'user = @request.auth.id'
const OWN_OR_STAFF = `(${OWN} || ${STAFF})`
const SELF_CREATE = '@request.auth.id != "" && @request.body.user = @request.auth.id'

const DATE_KEY = '^\\d{4}-\\d{2}-\\d{2}$'
const TIME_HM = '^([01]\\d|2[0-3]):[0-5]\\d$'

const timestamps = () => [
  { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
  { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
]

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    // ---- teams (needs users) --------------------------------------------------
    const teams = new Collection({
      type: 'base',
      name: 'teams',
      listRule: AUTH,
      viewRule: AUTH,
      createRule: ADMIN,
      updateRule: ADMIN,
      deleteRule: ADMIN,
      fields: [
        { type: 'text', name: 'name', required: true, max: 100, presentable: true },
        { type: 'relation', name: 'manager', collectionId: users.id, maxSelect: 1 },
        ...timestamps()
      ],
      indexes: ['CREATE UNIQUE INDEX idx_teams_name ON teams (name)']
    })
    app.save(teams)

    // ---- users (built-in auth collection) ------------------------------------
    const nameField = users.fields.getByName('name')
    if (nameField) nameField.name = 'full_name'
    users.fields.add(new TextField({ name: 'designation', max: 100 }))
    users.fields.add(new TextField({ name: 'phone', max: 30 }))
    users.fields.add(new RelationField({ name: 'team', collectionId: teams.id, maxSelect: 1 }))
    users.fields.add(
      new SelectField({ name: 'role', required: true, maxSelect: 1, values: ['admin', 'manager', 'employee'] })
    )
    users.fields.add(new TextField({ name: 'joined_on', pattern: DATE_KEY }))
    users.fields.add(new TextField({ name: 'left_on', pattern: DATE_KEY }))
    users.fields.add(new BoolField({ name: 'active' }))
    users.fields.add(new BoolField({ name: 'must_change_password' }))
    users.fields.add(new DateField({ name: 'tracking_consent_at' }))

    users.listRule = AUTH
    users.viewRule = AUTH
    users.createRule = null // only the invite route
    users.deleteRule = null
    users.updateRule =
      `${ADMIN} || (id = @request.auth.id` +
      ' && @request.body.role:isset = false && @request.body.team:isset = false' +
      ' && @request.body.active:isset = false && @request.body.joined_on:isset = false' +
      ' && @request.body.left_on:isset = false)'
    users.manageRule = ADMIN // admins can see emails and manage accounts
    users.authRule = 'active = true' // deactivated users can't log in
    users.authToken.duration = 30 * 24 * 60 * 60 // 30 days
    app.save(users)

    // ---- salaries -------------------------------------------------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'salaries',
        listRule: ADMIN,
        viewRule: ADMIN,
        createRule: ADMIN,
        updateRule: ADMIN,
        deleteRule: ADMIN,
        fields: [
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { type: 'number', name: 'monthly_salary_pkr', required: true, min: 0, onlyInt: true },
          ...timestamps()
        ],
        indexes: ['CREATE UNIQUE INDEX idx_salaries_user ON salaries (user)']
      })
    )

    // ---- org_settings (single record, created by the seed migration) ----------
    app.save(
      new Collection({
        type: 'base',
        name: 'org_settings',
        listRule: AUTH,
        viewRule: AUTH,
        createRule: null,
        updateRule: ADMIN,
        deleteRule: null,
        fields: [
          { type: 'text', name: 'shift_start', required: true, pattern: TIME_HM },
          { type: 'text', name: 'shift_end', required: true, pattern: TIME_HM },
          { type: 'json', name: 'work_days', required: true },
          { type: 'number', name: 'grace_minutes', min: 0, onlyInt: true },
          { type: 'number', name: 'full_day_min_hours', required: true, min: 0 },
          { type: 'number', name: 'half_day_min_hours', required: true, min: 0 },
          { type: 'number', name: 'idle_threshold_minutes', required: true, min: 1, onlyInt: true },
          { type: 'number', name: 'late_penalty_pkr', min: 0, onlyInt: true },
          { type: 'text', name: 'timezone', required: true },
          ...timestamps()
        ]
      })
    )

    // ---- activity_segments (client-made ids, never edited) --------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'activity_segments',
        listRule: OWN_OR_STAFF,
        viewRule: OWN_OR_STAFF,
        createRule: SELF_CREATE,
        updateRule: null,
        deleteRule: null,
        fields: [
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { type: 'select', name: 'state', required: true, maxSelect: 1, values: ['active', 'idle'] },
          { type: 'date', name: 'started_at', required: true },
          { type: 'date', name: 'ended_at', required: true },
          ...timestamps()
        ],
        indexes: ['CREATE INDEX idx_segments_user_start ON activity_segments (user, started_at)']
      })
    )

    // ---- presence -------------------------------------------------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'presence',
        listRule: OWN_OR_STAFF,
        viewRule: OWN_OR_STAFF,
        createRule: SELF_CREATE,
        updateRule: `${OWN} && (@request.body.user:isset = false || @request.body.user = @request.auth.id)`,
        deleteRule: null,
        fields: [
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { type: 'select', name: 'status', required: true, maxSelect: 1, values: ['active', 'idle', 'offline'] },
          { type: 'date', name: 'last_seen' },
          { type: 'number', name: 'today_active_s', min: 0, onlyInt: true },
          { type: 'number', name: 'today_idle_s', min: 0, onlyInt: true },
          ...timestamps()
        ],
        indexes: ['CREATE UNIQUE INDEX idx_presence_user ON presence (user)']
      })
    )

    // ---- attendance (written only by the attendance hook) ---------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'attendance',
        listRule: OWN_OR_STAFF,
        viewRule: OWN_OR_STAFF,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { type: 'text', name: 'date', required: true, pattern: DATE_KEY },
          {
            type: 'select',
            name: 'status',
            required: true,
            maxSelect: 1,
            values: ['present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'weekend']
          },
          { type: 'date', name: 'first_activity_at' },
          { type: 'date', name: 'last_activity_at' },
          { type: 'number', name: 'active_s', min: 0, onlyInt: true },
          { type: 'number', name: 'idle_s', min: 0, onlyInt: true },
          ...timestamps()
        ],
        indexes: ['CREATE UNIQUE INDEX idx_attendance_user_date ON attendance (user, date)']
      })
    )

    // ---- leave_types ------------------------------------------------------------
    const leaveTypes = new Collection({
      type: 'base',
      name: 'leave_types',
      listRule: AUTH,
      viewRule: AUTH,
      createRule: ADMIN,
      updateRule: ADMIN,
      deleteRule: ADMIN,
      fields: [
        { type: 'text', name: 'name', required: true, max: 50, presentable: true },
        { type: 'number', name: 'yearly_quota_days', min: 0 },
        { type: 'bool', name: 'paid' },
        ...timestamps()
      ],
      indexes: ['CREATE UNIQUE INDEX idx_leave_types_name ON leave_types (name)']
    })
    app.save(leaveTypes)

    // ---- leave_requests ---------------------------------------------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'leave_requests',
        listRule: OWN_OR_STAFF,
        viewRule: OWN_OR_STAFF,
        createRule: `${SELF_CREATE} && (@request.body.status:isset = false || @request.body.status = "pending")`,
        // Staff decide other people's requests; an employee may only cancel their own pending one.
        updateRule:
          `(${STAFF} && user != @request.auth.id)` +
          ` || (${OWN} && status = "pending" && @request.body.status = "cancelled")`,
        deleteRule: null,
        fields: [
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { type: 'relation', name: 'leave_type', required: true, collectionId: leaveTypes.id, maxSelect: 1 },
          { type: 'text', name: 'start_date', required: true, pattern: DATE_KEY },
          { type: 'text', name: 'end_date', required: true, pattern: DATE_KEY },
          { type: 'bool', name: 'half_day' },
          { type: 'number', name: 'days', required: true, min: 0.5 },
          { type: 'text', name: 'reason', max: 1000 },
          {
            type: 'select',
            name: 'status',
            maxSelect: 1,
            values: ['pending', 'approved', 'rejected', 'cancelled']
          },
          { type: 'relation', name: 'approver', collectionId: users.id, maxSelect: 1 },
          { type: 'date', name: 'decided_at' },
          { type: 'text', name: 'comment', max: 1000 },
          ...timestamps()
        ],
        indexes: ['CREATE INDEX idx_leave_user_start ON leave_requests (user, start_date)']
      })
    )

    // ---- leave_balances (view: current year, quota − approved days) -----------
    app.save(
      new Collection({
        type: 'view',
        name: 'leave_balances',
        listRule: OWN_OR_STAFF,
        viewRule: OWN_OR_STAFF,
        viewQuery: `
          SELECT
            (u.id || lt.id) AS id,
            u.id AS user,
            lt.id AS leave_type,
            lt.yearly_quota_days AS quota,
            CAST(COALESCE(SUM(lr.days), 0) AS REAL) AS used,
            CAST((lt.yearly_quota_days - COALESCE(SUM(lr.days), 0)) AS REAL) AS remaining
          FROM users u
          CROSS JOIN leave_types lt
          LEFT JOIN leave_requests lr
            ON lr.user = u.id
           AND lr.leave_type = lt.id
           AND lr.status = 'approved'
           AND substr(lr.start_date, 1, 4) = strftime('%Y', 'now', '+5 hours')
          WHERE u.active = TRUE
          GROUP BY u.id, lt.id`
      })
    )

    // ---- holidays & events ------------------------------------------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'holidays',
        listRule: AUTH,
        viewRule: AUTH,
        createRule: ADMIN,
        updateRule: ADMIN,
        deleteRule: ADMIN,
        fields: [
          { type: 'text', name: 'date', required: true, pattern: DATE_KEY },
          { type: 'text', name: 'name', required: true, max: 100, presentable: true },
          ...timestamps()
        ],
        indexes: ['CREATE UNIQUE INDEX idx_holidays_date ON holidays (date)']
      })
    )
    app.save(
      new Collection({
        type: 'base',
        name: 'events',
        listRule: AUTH,
        viewRule: AUTH,
        createRule: ADMIN,
        updateRule: ADMIN,
        deleteRule: ADMIN,
        fields: [
          { type: 'text', name: 'title', required: true, max: 200, presentable: true },
          { type: 'date', name: 'starts_at', required: true },
          { type: 'date', name: 'ends_at', required: true },
          { type: 'text', name: 'description', max: 2000 },
          { type: 'relation', name: 'team', collectionId: teams.id, maxSelect: 1 }, // empty = company-wide
          ...timestamps()
        ],
        indexes: ['CREATE INDEX idx_events_start ON events (starts_at)']
      })
    )

    // ---- payroll ----------------------------------------------------------------
    const payrollRuns = new Collection({
      type: 'base',
      name: 'payroll_runs',
      listRule: ADMIN,
      viewRule: ADMIN,
      createRule: ADMIN,
      updateRule: ADMIN,
      deleteRule: ADMIN,
      fields: [
        { type: 'text', name: 'month', required: true, pattern: '^\\d{4}-(0[1-9]|1[0-2])$', presentable: true },
        { type: 'select', name: 'status', required: true, maxSelect: 1, values: ['draft', 'finalized'] },
        ...timestamps()
      ],
      indexes: ['CREATE UNIQUE INDEX idx_payroll_runs_month ON payroll_runs (month)']
    })
    app.save(payrollRuns)
    app.save(
      new Collection({
        type: 'base',
        name: 'payroll_items',
        listRule: ADMIN,
        viewRule: ADMIN,
        createRule: ADMIN,
        updateRule: ADMIN,
        deleteRule: ADMIN,
        fields: [
          { type: 'relation', name: 'run', required: true, collectionId: payrollRuns.id, maxSelect: 1, cascadeDelete: true },
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1 },
          { type: 'number', name: 'base', min: 0 },
          { type: 'number', name: 'working_days', min: 0 },
          { type: 'number', name: 'absent_days', min: 0 },
          { type: 'number', name: 'unpaid_leave_days', min: 0 },
          { type: 'number', name: 'half_days', min: 0 },
          { type: 'number', name: 'late_count', min: 0, onlyInt: true },
          { type: 'number', name: 'deductions', min: 0 },
          { type: 'number', name: 'adjustment_pkr' },
          { type: 'text', name: 'note', max: 500 },
          { type: 'number', name: 'net' },
          ...timestamps()
        ],
        indexes: ['CREATE UNIQUE INDEX idx_payroll_items_run_user ON payroll_items (run, user)']
      })
    )

    // ---- notifications (created only by hooks) ----------------------------------
    app.save(
      new Collection({
        type: 'base',
        name: 'notifications',
        listRule: OWN,
        viewRule: OWN,
        createRule: null,
        updateRule: OWN,
        deleteRule: OWN,
        fields: [
          { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { type: 'text', name: 'type', required: true, max: 50 },
          { type: 'json', name: 'payload' },
          { type: 'date', name: 'read_at' },
          ...timestamps()
        ],
        indexes: ['CREATE INDEX idx_notifications_user ON notifications (user, created)']
      })
    )
  },
  (app) => {
    for (const name of [
      'notifications',
      'payroll_items',
      'payroll_runs',
      'events',
      'holidays',
      'leave_balances',
      'leave_requests',
      'leave_types',
      'attendance',
      'presence',
      'activity_segments',
      'org_settings',
      'salaries'
    ]) {
      app.delete(app.findCollectionByNameOrId(name))
    }
    const users = app.findCollectionByNameOrId('users')
    for (const f of [
      'designation',
      'phone',
      'team',
      'role',
      'joined_on',
      'left_on',
      'active',
      'must_change_password',
      'tracking_consent_at'
    ]) {
      users.fields.removeByName(f)
    }
    const fullName = users.fields.getByName('full_name')
    if (fullName) fullName.name = 'name'
    users.listRule = 'id = @request.auth.id'
    users.viewRule = 'id = @request.auth.id'
    users.createRule = ''
    users.updateRule = 'id = @request.auth.id'
    users.deleteRule = 'id = @request.auth.id'
    users.manageRule = null
    users.authRule = ''
    app.save(users)
    app.delete(app.findCollectionByNameOrId('teams'))
  }
)
