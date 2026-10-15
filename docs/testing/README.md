# Testing PSEO Tracker

Three test plans, one per role, cover every function of the app from every angle, so an update never ships broken:

- [Employee plan](employee.md) (E-01 … E-99)
- [Manager plan](manager.md) (M-01 … M-55)
- [Admin plan](admin.md) (A-01 … A-89)

The plans live in the **PSEO Tracker test plans** Claude Doc, where each test has a Result dropdown (Not run / Pass / Fail / Blocked) and comments. These files are the repo copy, so the plans change together with the code. When you change a feature, update its tests here and in the doc.

## Test setup

All testing runs on a separate test company in a throwaway database on port 8099. Your real database (port 8090, `server\pb_data`) and the app on your desktop are never touched.

| Step | Command (in `F:\agency-tracker`) | What happens |
| --- | --- | --- |
| 1. Start | `npm run test:env` | Starts the test database, fills it with the test company, builds the test app (`out-test/`) if the code changed, prints the accounts. Keep the window open. |
| 2. Open the app as someone | `npm run test:app -- --as asma@test.local` | Opens a test copy of the app already signed in. Run it again with other emails to test several roles side by side. |
| 3. Stop | **Ctrl+C** in the test:env window, or `npm run test:env -- --stop` | Closes the test apps and the test database and deletes all test data. |

The test dashboard is at `http://127.0.0.1:8099/_/` (superuser `root@test.local`, password `Test-pass-123`).

## Test accounts

Every account uses the password `Test-pass-123` unless shown. Dates are relative to the day you start the setup.

| Role | Name | Email | Use it for |
| --- | --- | --- | --- |
| Admin | Ayesha Admin | admin@test.local | The Admin plan; deciding managers' leave |
| Manager (Alpha) | Bilal Manager | bilal@test.local | The Manager plan |
| Manager (Bravo) | Sana Manager | sana@test.local | Team boundaries; her pending leave waits for the admin |
| Employee (Alpha) | Asma Khan | asma@test.local | The Employee plan: one approved Sick day, a late day, a holiday in her attendance |
| Employee (Alpha) | Chand Raza | chand@test.local | One absent day, one half day, a pending Casual request |
| Employee (Bravo) | Danish Ali | danish@test.local | No salary set; a rejected Annual request with a comment; late days |
| Employee (Bravo) | Erum Shah | erum@test.local | Joined during the current period (payroll flags her) |
| Employee (Alpha) | Nadia New | newhire@test.local, password `Temp-pass-1` | First sign-in: forced password change, then the tracking notice |
| Employee (left) | Faisal Left | faisal@test.local | Deactivated: must not be able to sign in |

Seeded on top: teams Alpha and Bravo, the default rules (09:00–18:00, Mon–Fri, 15 min grace, 5 min idle), the last 9 working days of tracked time and attendance, one "Test Holiday" in those days, a company-wide "Company town hall" tomorrow and an "Alpha sprint review" for Alpha only. Also an unpaid "Emergency" leave type, and finalized payroll for the three months before this one, so every role has pay to look at under Finance. The seed lives in `scripts/test-env/seed.mjs` and `seed-extras.mjs`.

## Before every update (about 20 minutes)

1. Run `npm run test:all` (typecheck, unit tests, server permission checks and the automated role suites). It must end with no failures.
2. Start the test setup and run every **★ smoke** test in the three plans by hand.
3. Anything that fails: fix it, rerun that test and its section, then release.

**Full pass** (before a big release, or every few updates): every test in all three plans.

## Columns

- **★** = in the quick smoke run before every update.
- **Auto** = ✓ when `npm run test:all` already checks it; – when only a person can check it (the tray, real keyboard and mouse idle, lock and sleep, the installer).
- **Result** (in the Claude Doc) = Not run, Pass, Fail or Blocked; comment on the row when it fails.
