# Agency Employee Tracker — Module-Based Implementation Roadmap

## Overview

This roadmap turns [plan.md](plan.md) into 13 modules (M0–M12). Each module lists its goal, files, backend objects, tasks and a "Done when" check, so it can be built, reviewed and tested on its own.

The backend is **PocketBase**, which is self-hosted and free. If you are new to it, read [docs/pocketbase-guide.md](docs/pocketbase-guide.md) first.

---

## Module map & build order

```
M0 Foundation ─► M1 Backend Core ─► M2 Auth & Shell ─┬─► M3 Organization ─► M4 Rules ─┐
                                                      │                                 │
                                                      └─────────────► M5 Tracking Engine ◄┘
                                                                         │
                                                                         ▼
                                                                    M6 Tracking UI
                                                                         │
                                         M10 Calendar (holidays) ◄───────┤
                                                                         ▼
                                    M8 Leave ─► M9 Notifications    M7 Attendance
                                         └──────────────┬──────────────┘
                                                        ▼
                                                   M11 Finance ─► M12 Packaging & Release
```
Sequence: M0 → M1 → M2 → M3 → M4 → M5 → M6 → M10a (holidays) → M8 → M7 → M9 → M10b (events + overlay) → M11 → M12.
Holidays and leave approval come before attendance because the attendance hook reads both.

---

## M0 — Foundation & Tooling
**Goal:** a project that builds and runs as an empty Electron window, next to a running PocketBase server.
- `package.json` already has `pocketbase`, `"type": "module"` (electron-store v12 is ESM-only), the dev deps and the scripts `dev`, `build`, `test`, `typecheck` and `pb`. Run `npm install` and confirm it completes. Add `electron-updater` as a dependency.
- Tailwind v4: add the `@tailwindcss/vite` plugin to the renderer config and put `@import "tailwindcss";` in `src/index.css`. It needs no `tailwind.config.ts`, PostCSS or autoprefixer.
- Download the latest `pocketbase_<ver>_windows_amd64.zip` from the PocketBase GitHub releases and extract `pocketbase.exe` into `server/`.
- Files: `electron.vite.config.ts`, `tsconfig*.json`, `src/index.css`, `electron/main/index.ts`, `electron/preload/index.ts`, `src/main.tsx`, `src/App.tsx`, `.env.example` (`VITE_PB_URL=http://127.0.0.1:8090`), `.gitignore` (node_modules, out, dist, .env, `server/pocketbase.exe`, `server/pb_data/`).
- `src/lib/format.ts` (`formatDuration` → `Xh Ym`) and `src/lib/dates.ts` (Asia/Karachi helpers) plus their Vitest tests.
- Window security from the start: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and a CSP meta tag allowing only `'self'` and `VITE_PB_URL`. The renderer reaches Node only through the preload bridge.
- Add `electron-log` and `electron/main/log.ts` (file logging in main, renderer errors forwarded over IPC).
- **Done when:** `npm run pb` serves the dashboard at `http://127.0.0.1:8090/_/`, `npm run dev` opens a window, and `npm test` passes the formatDuration cases (19380 → `5h 23m`, 0 → `0h 0m`).

## M1 — Backend Core (PocketBase)
**Goal:** the full data model, live in PocketBase.
- Create the first **superuser**, using the link printed on first start or `server/pocketbase.exe superuser upsert <email> <password>`.
- In the dashboard, add the custom fields to the built-in `users` auth collection (including `left_on` and `tracking_consent_at`), set its auth token duration to 30 days, and set its **auth rule** to `active = true` so inactive users can't log in. Then create the base collections `salaries`, `teams`, `org_settings`, `activity_segments`, `presence`, `attendance`, `leave_types`, `leave_requests`, `holidays`, `events`, `payroll_runs`, `payroll_items` and `notifications`, with the fields, relations and unique indexes from plan §5. PocketBase writes the matching migration files into `server/pb_migrations/` automatically.
- Create the view collection `leave_balances` (SQL with an `id` column).
- Set the API rules exactly as in the plan §5 rules table: salary and payroll admin-only, tracked time create-only for the owner, attendance and notifications written only by hooks.
- Create the first app admin: a `users` record with `role = admin`, made in the dashboard. Everyone else is added through the invite route.
- Seed migration `server/pb_migrations/<timestamp>_seed.js`: one `org_settings` record with the defaults (9–18, Mon–Fri, 15 min grace, 5 min idle, 8 h/4 h, PKR 500, Asia/Karachi) and the leave types Sick 8, Casual 10, Annual 14.
- Turn on scheduled backups in Settings → Backups (daily `0 21 * * *`, keep 14).
- `src/lib/pb.ts`: one shared `PocketBase` client using `VITE_PB_URL`.
- **Done when:** a fresh `pb_data` rebuilt from the migrations matches the dashboard, the app can read `org_settings` after logging in, a test employee gets an empty list from `salaries`, a manager sees only their own team's `presence` records, and an inactive user can't log in.

## M2 — Auth, App Shell, Profile & Roles
**Goal:** a logged-in user lands in a working shell.
- Stores: `src/stores/session.ts` (wraps `pb.authStore`, listens to `onChange`), `role.ts`, `theme.ts` (Zustand, persisted).
- `src/lib/roles.ts`: nav items and landing route per role (Employee / Manager / Admin), plus `switchableRoles(storedRole)` (the stored role and those below it). This is the only place role logic lives.
- Screens: `features/auth/Login` (`pb.collection('users').authWithPassword`) and `ChangePassword`, which is forced when `must_change_password` is true and clears the flag afterwards. Then `TrackingNotice`, a one-time screen explaining what is tracked; accepting it sets `tracking_consent_at`, and the tracker only starts once it is set. Add a route guard and refresh the session at startup with `authRefresh()`.
- Layout: `AppShell`, `Sidebar` (driven by roles.ts), `Topbar`, `ProfileMenu` (Radix: My Profile, Settings, Logout → `pb.authStore.clear()`), `RoleSwitcher`, placeholder `NotificationBell`.
- `features/profile/MyProfile` (edit name, phone, designation; avatar upload shown with `pb.files.getURL`) and `Settings` (theme, start on login via IPC, Open logs folder).
- UI kit in `components/ui/`: Button, Card, Input, Select, Table, Badge, Dialog.
- IPC: the renderer hands the auth token and user id to main with `window.tracker.setSession()`.
- **Done when:** login/logout works, the first login forces a password change and then shows the tracking notice, switching roles changes the sidebar and the landing page, an employee's dropdown shows only Employee, and the theme toggles.

## M3 — Organization
**Goal:** the admin can build the org.
- `features/org/`: Teams (CRUD, one manager each), TeamDetail, Employees list, EmployeeDetail (profile, team, designation, salary from `salaries`, with attendance and leave summary stubbed until M7/M8), InviteEmployee.
- Hook `server/pb_hooks/invite.pb.js`: `POST /api/org/invite` (admins only, checked with `e.auth.get("role")`). It creates a `users` record with a temporary password, team, role and `must_change_password = true`, plus the matching `salaries` record. It rejects duplicate emails.
- Same file: `POST /api/org/reset-password` (admins only). It sets a new temporary password and `must_change_password = true`. EmployeeDetail gets a **Reset password** button and a **Deactivate** action, which sets `active = false` and `left_on`.
- **Done when:** the admin adds an employee, the employee logs in with the temporary password, sets their own, and appears in their team. A reset password forces a change on the next login, and a deactivated employee can't log in.

## M4 — Rules
**Goal:** all policy is editable in one place.
- `features/rules/RulesForm` (shift, weekdays, grace, day thresholds, idle threshold, late penalty) and `LeaveTypes` (name, quota, paid).
- Shared hook `useOrgSettings()` (TanStack Query) used by the UI. The tracker in the main process gets settings over IPC.
- **Done when:** a change persists and the tracker picks up the new idle threshold.

## M5 — Tracking Engine (main process)
**Goal:** reliable active/idle capture with no lost time.
- `electron/main/tracker.ts`: a pure state machine (input: idle seconds + time; output: segment open/close events) plus a 15 s poll of `powerMonitor.getSystemIdleTime()`. Backdates the switch to idle, rolls segments every 5 min, closes them on lock/suspend/shutdown, and runs only within shift hours on working days.
- `electron/main/syncQueue.ts`: electron-store queue. Each segment gets a 15-character `[a-z0-9]` id when created and is sent with `pb.collection('activity_segments').create({ id, ... })`. A "duplicate id" error counts as already synced. A validation rejection (400) is logged and dropped. Network and 5xx errors retry with exponential backoff.
- `server/pb_hooks/lib/segments.js` (pure, Vitest-tested) + `segments.pb.js` (`onRecordCreateRequest` on `activity_segments`). It rejects a segment if:
  - `ended_at` is not after `started_at`
  - it lasts longer than 6 minutes
  - it ends more than 2 minutes after the server's current time
  - it is more than 30 days old
  - it overlaps an existing segment for the same user
- `electron/main/index.ts`: `app.requestSingleInstanceLock()`. A second launch focuses the existing window and quits.
- Tracking runs for everyone (employees, managers, admins) once `tracking_consent_at` is set.
- Presence heartbeat: update the user's `presence` record (status, last_seen, today totals), or create it if missing.
- `electron/main/tray.ts` (Open, today's time, and Quit for managers and admins only). Close-to-tray. `setLoginItemSettings({ openAtLogin: true })`.
- `electron/main/session.ts`: `authRefresh()` at startup and every 12 h. On a 401, keep queuing segments, set the tray to "Signed out – sign in to sync" and tell the renderer to show Login. The queue flushes after sign-in.
- `electron/main/ipc.ts` + preload `window.tracker.*` (setSession, getToday, getStatus, setAutostart, setSettings).
- The main process uses its own `PocketBase` client and loads the token with `pb.authStore.save(token, record)`.
- Tests: state-machine cases (active→idle backdating, 5 min roll, lock, out-of-shift) and segment-validation cases.
- **Done when:**
  - segments land in PocketBase
  - offline segments sync after reconnect with no duplicates, and totals match
  - an expired session queues segments and syncs them after sign-in
  - an employee's tray has no Quit
  - a PC clock set 1 hour ahead produces rejected, logged segments
  - a second launch doesn't start a second tracker

## M6 — Tracking UI
- `features/tracking/MyStats` (today's active/idle, status badge, week totals).
- `LiveBoard`: `pb.collection('presence').subscribe('*', …)`. The API rules already limit a manager to their own teams. Offline when last_seen is over 2 min ago; On leave added after M8. Unsubscribe on unmount.
- `Reports` (daily/weekly/monthly per employee, team/employee/date filters, CSV export). Totals come from `server/pb_hooks/reports.pb.js` (`GET /api/reports/activity`), which runs grouped SQL through `$app.db()`. It limits managers to teams where `teams.manager` is them, and refuses employees.
- **Done when:** idle shows on the board within about 15 s, the CSV matches the on-screen totals, and a manager sees only their own team on both screens.

## M7 — Attendance
- `server/pb_hooks/lib/attendance.js`: a pure CommonJS function `statusFor(day, settings, segments, leaves, holidays)` that follows the status order in plan §4.2. Vitest covers one case per status.
- `server/pb_hooks/attendance.pb.js`: `cronAdd('attendance', '0 20 * * *', …)` (20:00 UTC = 01:00 PKT, for the previous day) and `POST /api/attendance/recompute` (body: date, admins only). Both upsert `attendance` records, skipping days outside `joined_on`–`left_on`.
- `features/attendance/AttendanceTable` (employees × days grid, with a Recompute button) and `MyAttendance`.
- **Done when:** Late vs Present respects grace, and leave/holiday/weekend dates resolve correctly.

## M8 — Leave Approval
- `features/leave/ApplyLeave` (type, dates, half day, reason; computes `days` from working days), `MyLeaves` (cancel while pending), `Approvals` (manager queue + admin override, comment), `Balances` (reads the `leave_balances` view collection).
- Validation: no overlapping requests, quota check, working days only.
- A manager's own request goes to the admins' approval queue. The API rule blocks anyone approving their own request.
- **Done when:** the full apply → approve → balance-decrease flow works, and a manager can't approve their own leave.

## M9 — Notifications
- `server/pb_hooks/notifications.pb.js`: `onRecordAfterCreateSuccess` on `leave_requests` → a notification for the team manager. `onRecordAfterUpdateSuccess` when the status changes to approved or rejected → a notification for the employee.
- `NotificationBell`: unread count from a `notifications` subscription filtered to the current user, a dropdown list, and mark-read (sets `read_at`).
- **Done when:** the manager sees the bell increment live on a new request.

## M10 — Working Calendar
- **M10a:** `HolidayManager` (admin CRUD on `holidays`). Feeds attendance and payroll.
- **M10b:** `MonthCalendar` (holidays, approved-leave overlay "who's off", events) and `EventForm` (company-wide or one team).
- **Done when:** an approved leave and a holiday both show on the month view.

## M11 — Finance (Payroll)
- `server/pb_hooks/lib/payroll.js`: a pure calculation (per-day rate excludes weekends and holidays; deductions = (absent + unpaid leave + 0.5 × half) × rate + late × penalty; net = base − deductions + `adjustment_pkr`). No automatic pro-rating: in the draft, the admin sets the adjustment and note for mid-month joiners and leavers. Vitest cases, including a negative and a positive adjustment.
- `server/pb_hooks/payroll.pb.js`: `POST /api/payroll/run` (body: month, admins only) creates a draft run and its `payroll_items` from `salaries`, `attendance` and `leave_requests`. A finalize action sets `status = finalized`. `onRecordUpdateRequest` and `onRecordDeleteRequest` hooks reject changes to finalized runs and their items.
- `features/finance/SalarySetup` (edits `salaries`), `PayrollRuns`, `PayrollDetail` (per-employee breakdown).
- **Done when:** one employee's net matches a hand calculation and a finalized run is read-only.

## M12 — Packaging & Release
- **Production server.** Pick one:
  - **Office PC (always on):** install `pocketbase.exe` as a Windows service with NSSM. For staff outside the office, use Tailscale (free private network, no domain needed) or a Cloudflare Tunnel (needs a domain on Cloudflare).
  - **Oracle Cloud Always Free VM:** run `pocketbase serve yourdomain.com` for automatic HTTPS, as a systemd service.
- Give the server a **stable hostname** (a Tailscale machine name or a subdomain, never a raw IP) and build with that as `VITE_PB_URL`.
- Copy `pb_migrations/` and `pb_hooks/` to the server. Migrations apply automatically on start.
- **Data protection** (see [docs/pocketbase-guide.md §7](docs/pocketbase-guide.md)):
  - Point backups at a free off-site S3 bucket (Cloudflare R2 or Backblaze B2). Run **Backup now** and confirm the zip lands in the bucket.
  - Office PC only:
    - put `pb_data` on a non-C: drive (`--dir D:\pocketbase\pb_data`)
    - run `nssm set PocketBase AppStopMethodConsole 30000`
    - plug the PC into a UPS and turn off sleep
  - Restore drill: restore the latest bucket backup into a scratch folder on port 8099 and check the records.
- `electron-builder.yml` (NSIS, app icon, appId, per-user install, `publish: github` to a public releases-only repo). The production `VITE_PB_URL` is baked in at build time.
- `electron/main/updater.ts`: `autoUpdater.checkForUpdatesAndNotify()` at startup and every 6 h. The update downloads silently and installs on the next restart. The installer isn't code-signed, so Windows SmartScreen shows a warning on the first install. Updates aren't affected.
- Verify autostart after a reboot, tray behaviour, and tracking in the installed build against the production server.
- Run the full manual E2E from plan §8 (steps 1–14).
- **Done when:** the installer runs on a clean Windows 10/11 machine, tracking auto-starts, data appears on the production server, a published update installs itself, and a backup from the S3 bucket has been restored successfully.

---

## Cross-cutting (applies to every module)
- Use TanStack Query for all server reads/writes (wrapping the PocketBase SDK) and Zustand only for local UI state.
- Every time display goes through `formatDuration`, and every date goes through `dates.ts` (Asia/Karachi; PocketBase stores UTC).
- UI role checks go only through `roles.ts`. Data access is enforced by the API rules in plan §5 and the admin checks in the custom routes. Never rely on the UI alone.
- Post-MVP features (ping & acknowledge, Google Sheets export, Slack) are listed in plan §11. Don't build them in these modules.
- Schema changes are made in the dashboard. Commit the generated `pb_migrations/` files together with the code that uses them.
- Each module ends with: typecheck, Vitest, a manual check of its "Done when", and a commit.
