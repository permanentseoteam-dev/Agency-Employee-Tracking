# Agency Employee Tracker — MVP Plan

A Windows desktop app for the agency. It tracks employee activity (active and idle hours), attendance, leave approvals and rules. It also covers finance (payroll), a working calendar and the organization (teams, managers, employees). The top bar has a working profile menu and a role-switch dropdown.

- **Platform:** Windows 10/11 desktop
- **Scale:** fewer than 50 employees, one agency
- **Currency:** PKR
- **Timezone:** Asia/Karachi
- **Project path:** `F:\agency-tracker`
- **Backend:** PocketBase, self-hosted and free. It replaced Supabase to avoid usage-based billing. See [docs/pocketbase-guide.md](docs/pocketbase-guide.md).

---

## 1. Scope at a glance

| Section | In the MVP | Not in the MVP |
|---|---|---|
| Live Tracking | Automatic active/idle tracking during shift hours, team live board, history and reports with CSV export, own stats for each employee | Screenshots, app/window logging, manual pause |
| Attendance | Automatic status from activity: Present / Late / Half day / Absent / On leave / Holiday / Weekend | Manual check-in, regularization requests |
| Leave Approval | Apply, cancel, manager approves or rejects, admin override, balances | Multi-level approval |
| Rules | Shift timing, working weekdays, grace period, day thresholds, idle threshold, leave types and quotas, late penalty | Per-team or per-employee shifts, policy documents |
| Finance | Monthly payroll: fixed salary − deductions | Payslip PDFs, expenses, company revenue |
| Working Calendar | Public/company holidays, approved-leave overlay, events and meetings | Google/Outlook sync |
| Organization | Teams (one manager each), employees, adding employees with a temporary password | Departments, multiple managers per team, email invites |
| Profile & Roles | Profile icon menu (My Profile, Settings, Logout) and role-switch dropdown. Salary, payroll and tracked time are locked down by role on the server | Full per-screen role permissions (defined later) |
| Notifications | In-app bell for leave requests and decisions | Email, desktop toasts |
| Updates | Silent auto-update from GitHub Releases | — |

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron with electron-vite |
| UI | React + TypeScript, Tailwind CSS, shadcn-style components, lucide-react icons, Radix dropdown menu |
| State / data | Zustand (session, role, theme), TanStack Query (wrapping the PocketBase SDK), react-router |
| Backend | **PocketBase**, a single `pocketbase.exe` that bundles the SQLite database, auth, REST API, realtime, JS hooks, cron, file storage, backups and an admin dashboard |
| Client SDK | `pocketbase` npm package (used in both the renderer and the Electron main process) |
| Offline queue | electron-store in the main process |
| Logging | electron-log (main process, rotating file in `%APPDATA%\Agency Tracker\logs`) |
| App security | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a strict Content-Security-Policy (only the app itself and the PocketBase URL), no remote content |
| Tests | Vitest |
| Packaging | electron-builder, NSIS installer for Windows |
| Auto-update | electron-updater, publishing to GitHub Releases in a public releases-only repo (free, no token in the app) |
| Hosting | Development: `pocketbase.exe` on the developer PC. Production (chosen in M12): an always-on office PC running it as a Windows service and reached through Cloudflare Tunnel or Tailscale, **or** an Oracle Cloud Always Free VM. All of these are free. Use a stable hostname (a Tailscale machine name or a subdomain), never a raw IP, because the address is built into the app. |

---

## 3. Architecture

```
┌──────────────────────── Electron main process ─────────────────────────┐
│ index.ts      requestSingleInstanceLock() → second copy quits          │
│ tracker.ts    every 15s: powerMonitor.getSystemIdleTime()              │
│               → state active | idle → open/close activity segments     │
│               → presence heartbeat (status + today totals)             │
│ syncQueue.ts  segments queued in electron-store → created in           │
│               PocketBase with retry/backoff (idempotent: client-made   │
│               15-char record id, duplicate = already synced,           │
│               rejected by server validation = logged and dropped)      │
│ session       authRefresh() at startup + every 12 h; on 401 keep       │
│               queuing, tray shows "Signed out – sign in to sync"       │
│ tray.ts       tray icon + menu: Open, today's time, Quit (Quit for     │
│               manager/admin only)                                      │
│ autostart     app.setLoginItemSettings({ openAtLogin: true })          │
│ updater.ts    electron-updater: check at startup + every 6 h,          │
│               install on next restart                                  │
└───────────────▲─────────────────────────────────────────────────────────┘
                │ IPC (contextBridge preload: window.tracker.*)
┌───────────────┴──────── Renderer (React UI) ───────────────────────────┐
│ All screens. Talks to PocketBase with the user's auth token and hands  │
│ the token to the main process so the tracker writes as that user.      │
└───────────────▲─────────────────────────────────────────────────────────┘
                │ HTTP(S) REST + realtime (server-sent events)
┌───────────────┴──────────── PocketBase server ─────────────────────────┐
│ pocketbase.exe serve   → SQLite (pb_data/) · auth · API rules ·        │
│                          realtime · admin dashboard (/_/) · backups    │
│ pb_hooks/  invite.pb.js         POST /api/org/invite,                  │
│                                 POST /api/org/reset-password           │
│            segments.pb.js       validate segments (overlap, length,    │
│                                 future-dated, older than 30 days)      │
│            attendance.pb.js     cron 01:00 PKT + POST /api/attendance/ │
│                                 recompute                              │
│            payroll.pb.js        POST /api/payroll/run, finalize lock   │
│            notifications.pb.js  leave_requests → notifications         │
│            reports.pb.js        GET /api/reports/activity              │
│            lib/attendance.js, lib/payroll.js, lib/segments.js          │
│                                 (pure logic, unit-tested)              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Feature specifications

### 4.1 Live Tracking
- **Detection:** system-wide keyboard and mouse inactivity, read with `powerMonitor.getSystemIdleTime()`. No native modules are needed.
- **Idle rule:** no input for at least the **idle threshold** (set in Rules, default 5 min) means idle. The switch to idle is **backdated** to `now − idleSeconds`, so the inactive stretch is never counted as active.
- **Segments:** a segment closes on every state change and also every 5 minutes, so data reaches the server steadily. Locking the screen, suspend and shutdown also close the open segment.
- **When tracking runs:** only during shift hours on working days. There is no pause button. Closing the window sends the app to the tray and tracking continues. The app starts automatically at Windows login. The tray's **Quit** option appears only for managers and admins. If an employee's app is killed, the Live Board shows them Offline after 2 minutes.
- **Session:** the users token lasts 30 days. The main process refreshes it at startup and every 12 hours. If it expires, tracking keeps queuing locally and syncs after the user signs in again.
- **Who is tracked:** everyone with an account (employees, managers and admins).
- **Tracking notice:** on first login, after the password change, a one-time notice explains what is tracked: active/idle time only, no screenshots or app names. Tracking starts once the user accepts it. The acceptance time is stored in `users.tracking_consent_at`.
- **One tracker per person:** `app.requestSingleInstanceLock()` stops a second copy on the same PC. The server rejects segments that overlap an existing segment for the same user, which covers two PCs.
- **Server validation** (`segments.pb.js`, on create). A segment is rejected if:
  - `ended_at` is not after `started_at`
  - it lasts longer than 6 minutes
  - it ends more than 2 minutes after the server's current time (a PC clock set forward)
  - it is more than 30 days old
  - it overlaps an existing segment for the same user

  The sync queue drops a rejected segment after logging it and does not retry it.
- **Logs:** `electron-log` writes to `%APPDATA%\Agency Tracker\logs`. Settings has "Open logs folder" so an employee can send the file when there's a problem.
- **Known limit:** a video call with no keyboard or mouse input counts as idle. A Focus / In a meeting status is planned for after the MVP (§11).
- **Offline:** segments are queued locally and synced when the connection returns, so no time is lost.
- **Time format everywhere:** `Xh Ym`, for example `5h 23m`.
- **Screens:**
  - **My Stats** (every employee): today's active and idle time, a status badge, and this week's totals.
  - **Team Live Board** (manager/admin; a manager sees only the teams they manage, an admin sees everyone): one card or row per employee showing Active / Idle / Offline / On leave and today's active and idle time. It updates in realtime through a PocketBase subscription on `presence`. An employee counts as Offline when no heartbeat has arrived for over 2 minutes.
  - **Reports:** daily, weekly and monthly active and idle hours per employee. Filter by team, employee and date range. Export to CSV. Totals come from the `reports.pb.js` route, which limits a manager to their own teams.

### 4.2 Attendance
- Marked automatically by the attendance hook. It runs nightly as a PocketBase cron job at 01:00 PKT (`0 20 * * *` UTC) for the previous day. It can also be run on demand with `POST /api/attendance/recompute`.
- No record is created for days before `joined_on` or after `left_on`.
- **Status order (first match wins):**
  1. Holiday or weekend
  2. **On leave**: an approved leave covers the date
  3. **Absent**: no activity on a working day
  4. **Half day**: active time below the half-day minimum
  5. **Late**: first activity after shift start + grace minutes
  6. **Present**
- **Screens:** a monthly attendance grid (employees × days) for managers (their own teams) and admins (everyone), and My Attendance for employees.

### 4.3 Leave Approval
- **Flow:** the employee applies (type, dates, optional half day, reason). The team manager approves or rejects with an optional comment. An admin can override. The employee can cancel while the request is pending.
- **A manager's own leave** goes to the admins. A manager can never approve their own request.
- **Days:** working days in the range are counted when the request is made and stored in `days`, which is 0.5 for a half day.
- **Balances:** yearly quota per leave type minus approved days used, from the `leave_balances` view collection.
- Each request and each decision creates an in-app notification through `notifications.pb.js`.
- **Screens:** Apply Leave, My Leaves, Approvals queue (manager), Balances.

### 4.4 Rules
These settings live in a single `org_settings` record:
- shift start and end time, and working weekdays
- grace minutes for being late
- full-day and half-day minimum hours
- idle threshold in minutes
- late penalty in PKR
- leave types, with name, yearly quota and paid or unpaid (in the `leave_types` collection)

### 4.5 Finance (Payroll)
- Each employee has a fixed **monthly salary (PKR)**, stored in the admin-only `salaries` collection.
- **Per-day rate** = monthly salary ÷ working days in the month (weekends and holidays excluded).
- **Deductions** = (absent days + unpaid-leave days + 0.5 × half days) × per-day rate + (late count × late penalty).
- **Net** = monthly salary − deductions + adjustment.
- **Adjustment (admin only):** each draft line has `adjustment_pkr` (plus or minus) and a `note`. The admin decides the final pay for anyone who joined or left mid-month, or for any other exception, for example −20,000 with the note "Left on the 18th". The app doesn't pro-rate automatically.
- **Flow:** the admin picks a month. `POST /api/payroll/run` creates **draft** items. The admin reviews each employee's breakdown, then **finalizes**. A finalized run is locked: a hook rejects any change to it or its items.
- **Screens:** Salary Setup, Payroll Runs, Payroll Detail.

### 4.6 Working Calendar
- A month view showing:
  - public and company holidays (admin manages them)
  - approved leaves (who is off each day)
  - events and meetings (company-wide or for one team)
- Holidays feed into attendance and payroll.

### 4.7 Organization
- **Teams:** each team has one manager and many employees. Each employee belongs to exactly one team.
- **Employees:** a list and a detail page with profile, team, designation, salary, attendance and leave summary.
- **Add employee:** the admin enters the name, email, team and a temporary password. `POST /api/org/invite` creates the account with `must_change_password = true`, and the admin shares the password with the employee. On first login the app makes the employee choose a new password. No email service is needed. SMTP can be added later for "forgot password".
- **Forgot password:** the admin clicks **Reset password** on the employee's page. `POST /api/org/reset-password` sets a new temporary password and `must_change_password = true`, and the admin shares the new password.
- **Offboarding:** the admin sets `active = false` and `left_on`. An inactive user can't log in (users auth rule `active = true`). Their history stays for reports and payroll.

### 4.8 Profile icon & role switcher (top bar)
- **Profile icon:** shows the avatar or initials and opens a menu with:
  - **My Profile:** view and edit name, photo, phone and designation
  - **Settings:** light/dark theme, start on Windows login, and "Open logs folder"
  - **Logout**
- **Role dropdown** (next to the profile icon): lists the user's stored role and the roles below it. Admin sees Admin / Manager / Employee, a Manager sees Manager / Employee, and an Employee sees only Employee. Switching changes the sidebar nav and the landing page. The server enforces access to data separately (§5).
  - Employee lands on My Stats, My Attendance and My Leaves.
  - Manager also gets the Live Board and Approvals.
  - Admin gets everything, including Rules, Finance and Organization admin.
- All role logic lives in **`src/lib/roles.ts`**, so real permissions can be added there later without touching screens.

### 4.9 Notifications
- A bell icon in the top bar with an unread count, updated through a PocketBase realtime subscription on `notifications`.
- It covers new leave requests (sent to the manager) and approval or rejection decisions (sent to the employee).

---

## 5. Collections (PocketBase)

Every collection gets automatic `id` (15 characters), `created` and `updated` fields. "→" marks a **relation** field. Instants (`started_at`, `last_seen`, `decided_at` …) are UTC date fields shown in Asia/Karachi. **Date-only values** (`attendance.date`, `holidays.date`, leave `start_date`/`end_date`, `joined_on`, `left_on`) are `"YYYY-MM-DD"` text in Karachi time, which avoids a 5-hour shift moving them to the wrong day. The schema lives in `server/pb_migrations/1791950000_init_schema.js`, and the defaults are in `1791950100_seed_defaults.js`.

| Collection (type) | Fields |
|---|---|
| `users` (auth) | built-in email, password and verified, plus full_name, avatar (file), designation, phone, team → teams, role (select: admin/manager/employee, used by the API rules), joined_on, left_on, active (bool), must_change_password (bool), tracking_consent_at. **Auth rule:** `active = true` (inactive users can't log in). |
| `salaries` (base) | user → users (unique), monthly_salary_pkr. Kept out of `users` because an API rule can't hide a single field. |
| `teams` (base) | name, manager → users |
| `org_settings` (base, single record) | shift_start, shift_end (text "HH:mm"), work_days (json, e.g. [1,2,3,4,5]), grace_minutes, full_day_min_hours, half_day_min_hours, idle_threshold_minutes, late_penalty_pkr, timezone |
| `activity_segments` (base) | user → users, state (select: active/idle), started_at, ended_at. The record id is made by the client so sync can be retried safely. |
| `presence` (base) | user → users (unique), status (active/idle/offline), last_seen, today_active_s, today_idle_s |
| `attendance` (base) | user → users, date, status, first_activity_at, last_activity_at, active_s, idle_s. Unique index on (user, date). |
| `leave_types` (base) | name, yearly_quota_days, paid (bool) |
| `leave_requests` (base) | user → users, leave_type → leave_types, start_date, end_date, half_day (bool), days (number), reason, status (pending/approved/rejected/cancelled), approver → users, decided_at, comment |
| `leave_balances` (**view**) | user, leave_type, quota, used, remaining for the current year. It is a SQL `SELECT` over users × leave_types × approved `leave_requests.days` and must return an `id` column. |
| `holidays` (base) | date (unique), name |
| `events` (base) | title, starts_at, ends_at, description, team → teams (empty = company-wide) |
| `payroll_runs` (base) | month ("YYYY-MM", unique), status (draft/finalized) |
| `payroll_items` (base) | run → payroll_runs, user → users, base, working_days, absent_days, unpaid_leave_days, half_days, late_count, deductions, adjustment_pkr, note, net |
| `notifications` (base) | user → users, type, payload (json), read_at |

**API rules (MVP):** sensitive data is locked by role. Everything else is open to any logged-in user.

Shorthand used in the table:

| Short | Rule expression |
|---|---|
| auth | `@request.auth.id != ""` |
| admin | `@request.auth.role = "admin"` |
| staff | `@request.auth.role = "admin" \|\| (@request.auth.role = "manager" && user.team.manager = @request.auth.id)`: admins see everyone, a manager sees only people in the teams they manage |
| own | `user = @request.auth.id` |
| self-create | `@request.auth.id != "" && @request.body.user = @request.auth.id` |
| locked | rule left empty: only superusers and server hooks |

| Collection | List / View | Create | Update | Delete |
|---|---|---|---|---|
| `users` | auth | locked (invite route) | admin, or `id = @request.auth.id && @request.body.role:isset = false && @request.body.team:isset = false && @request.body.active:isset = false` | locked |
| `salaries`, `payroll_runs`, `payroll_items` | admin | admin | admin (hooks: a finalized run and its items are locked; only a draft item's adjustment and note change) | admin (not when finalized) |
| `activity_segments` | own \|\| staff | self-create | locked | locked |
| `presence` | own \|\| staff | self-create | own | locked |
| `attendance` | own \|\| staff | locked (hook) | locked (hook) | locked |
| `leave_requests` | own \|\| staff | self-create | (staff && user != @request.auth.id), or `user = @request.auth.id && status = "pending" && @request.body.status = "cancelled"` | locked |
| `leave_balances` (view) | own \|\| staff | — | — | — |
| `notifications` | own | locked (hook) | own, `read_at` only (migration `1791960000`) | own |
| `teams`, `org_settings`, `leave_types`, `holidays`, `events` | auth | admin | admin | admin |

The custom routes `/api/org/invite`, `/api/org/reset-password`, `/api/payroll/run` and finalize, and `/api/attendance/recompute` reject any caller whose `e.auth.get("role")` isn't `admin`. Server hooks write as the app itself, so locked rules don't block them. A rule left **empty/locked** means superusers only, so every rule that should be open must be set.

---

## 6. Project structure

```
F:\agency-tracker
├─ electron/
│  ├─ main/      index.ts, tracker.ts, engine.ts, syncQueue.ts, session.ts, tray.ts, updater.ts, log.ts, ipc.ts
│  └─ preload/   index.ts
├─ src/
│  ├─ lib/       pb.ts (PocketBase client), format.ts (formatDuration → "5h 23m"), dates.ts, roles.ts
│  ├─ stores/    session.ts, role.ts, theme.ts
│  ├─ components/
│  │  ├─ ui/     Button, Card, Input, Select, Table, Badge, Dialog …
│  │  └─ layout/ AppShell, Sidebar, Topbar, ProfileMenu, RoleSwitcher, NotificationBell
│  └─ features/
│     ├─ auth/        Login, ChangePassword, TrackingNotice
│     ├─ tracking/    LiveBoard, MyStats, Reports
│     ├─ attendance/  AttendanceTable, MyAttendance
│     ├─ leave/       ApplyLeave, MyLeaves, Approvals, Balances
│     ├─ rules/       RulesForm, LeaveTypes
│     ├─ finance/     SalarySetup, PayrollRuns, PayrollDetail
│     ├─ calendar/    MonthCalendar, HolidayManager, EventForm
│     ├─ org/         Teams, TeamDetail, Employees, EmployeeDetail, InviteEmployee
│     └─ profile/     MyProfile, Settings
├─ server/
│  ├─ pocketbase.exe        (downloaded, not committed)
│  ├─ pb_data/              (database + uploaded files, not committed)
│  ├─ pb_migrations/        (auto-generated schema changes + seed, committed)
│  └─ pb_hooks/
│     ├─ invite.pb.js, segments.pb.js, attendance.pb.js, payroll.pb.js,
│     │  notifications.pb.js, reports.pb.js
│     └─ lib/  attendance.js, payroll.js, segments.js   (pure CommonJS, tested by Vitest)
├─ docs/      pocketbase-guide.md, deployment.md
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ roadmap.md
└─ plan.md
```

---

## 7. Build milestones

| # | Milestone | Deliverables |
|---|---|---|
| 1 | Scaffold | electron-vite + React + TS + Tailwind, PocketBase server and collections, login and forced password change, AppShell with Sidebar, Topbar, ProfileMenu and RoleSwitcher |
| 2 | Org + Rules | Teams and employees CRUD, the add-employee route, Rules form, leave types |
| 3 | Tracking | Main-process tracker, sync queue, tray, autostart, presence. Then Live Board, My Stats and Reports with CSV export |
| 4 | Attendance | Attendance hook (cron + recompute route), attendance grid, My Attendance |
| 5 | Leave | Apply, approvals, balances view, notification hook and bell |
| 6 | Calendar | Holidays, events, leave overlay |
| 7 | Finance | Salary setup, payroll route, review, finalize lock |
| 8 | Packaging | NSIS installer, app icon, auto-start check, auto-update from GitHub Releases, production PocketBase server with off-site S3 backups (R2/B2) and a tested restore |

The detailed module breakdown is in [roadmap.md](roadmap.md).

---

## 8. Testing & verification

**Unit tests (Vitest)**
- `formatDuration`: for example, 19380 s gives `5h 23m`, and 0 gives `0h 0m`.
- Tracker state machine: feed it simulated idle readings and check the segments, including the backdated idle start.
- Attendance status function (`server/pb_hooks/lib/attendance.js`): one case per status.
- Payroll calculation (`server/pb_hooks/lib/payroll.js`): absences, unpaid leave, half days, late penalties, holidays, and the admin adjustment.
- Segment validation (`server/pb_hooks/lib/segments.js`): overlapping, too long, future-dated, too old and valid cases.

**Manual end-to-end on Windows**
1. Start the server with `npm run pb` and the app with `npm run dev`. Log in as two users created by the admin, on two machines or VMs.
2. Leave one machine without input past the idle threshold. Within about 15 s it shows Idle on the Live Board, and idle time accrues in `Xh Ym`.
3. Disconnect the network, keep working, then reconnect. The queued segments sync and the totals match.
4. Apply for leave as the employee. The manager gets a bell notification and approves. The leave appears on the calendar and the balance goes down.
5. Recompute attendance for today. The Late and Present statuses respect the grace period.
6. Run payroll for the month. One employee's deductions match a hand calculation.
7. Switch roles in the dropdown. The sidebar and landing page change.
8. Use the profile menu: edit profile, toggle the theme, log out.
9. Run `npm run build` to produce the installer. Install it, reboot, and confirm the app auto-starts and tracks against the production server.
10. Signed in as an employee, call the API directly: listing `salaries` or `payroll_items` returns nothing, editing an `activity_segments` record is refused, and the tray has no Quit.
11. As a manager, the Live Board, attendance and reports show only your own team. Your own leave request can't be approved by you.
12. Set a PC clock 1 hour ahead and the segments are rejected and logged. Start the app twice and only one copy runs.
13. Deactivate an employee and they can't log in. Reset a password and the employee is forced to change it at the next login.
14. Publish a higher version to GitHub Releases. The installed app updates itself after a restart.

---

## 9. Open items / needed from you
- **Production hosting** (decided in M12: the office PC with Tailscale, backups copied to the E: drive; see [docs/deployment.md](docs/deployment.md)). Original note: an always-on office PC with Cloudflare Tunnel or Tailscale, or an Oracle Cloud Always Free VM. Either way, daily backups go to a free off-site S3 bucket (Cloudflare R2 or Backblaze B2), so a crashed or corrupted server loses at most a day of data. The office-PC option also needs `pb_data` on a non-C: drive, a UPS and the NSSM graceful stop. See [docs/pocketbase-guide.md §7](docs/pocketbase-guide.md).
- **Optional SMTP** for "forgot password" emails: a Gmail app password or the Brevo free plan.
- **Role definitions:** full per-screen permissions come later, in `src/lib/roles.ts` and the API rules. The data locks in §5 apply from the start.
- **Defaults to confirm:**
  - shift 9:00–18:00, Monday to Friday
  - 15-minute grace period
  - 5-minute idle threshold
  - full day at 8 h, half day at 4 h
  - leave types: Sick 8, Casual 10, Annual 14
  - late penalty of PKR 500

## 10. Current status
- **M0 done** (2026-10-14), not yet committed:
  - PocketBase **v0.40.5** in `server/`
  - electron-vite 5, Electron 44, React 19 and Tailwind v4 set up
  - secure window and file logging working
  - `formatDuration` and the Asia/Karachi date helpers, with 16 tests passing
- Docs: this plan, [roadmap.md](roadmap.md), [docs/pocketbase-guide.md](docs/pocketbase-guide.md) and [docs/client-solutions-summary.md](docs/client-solutions-summary.md).
- **M1 done** (2026-10-14):
  - all 14 collections plus the `leave_balances` view, with the locked-down rules from §5
  - seed defaults loaded
  - 30-day logins
  - daily backups scheduled
  - `npm run check:rules`: 49 of 49 checks pass
- **M2 done** (2026-10-14):
  - login, the forced password change and the one-time tracking notice
  - the app shell (sidebar, top bar, profile menu, role switcher and a placeholder bell)
  - My Profile (with photo upload) and Settings (theme, start with Windows, logs folder)
  - route guard by role, and a crash screen that logs errors
  - 20 of 20 end-to-end checks pass on the built app
- **M3 done** (2026-10-14):
  - Organization → Employees: search, team filter, inactive toggle
  - Add employee, with a generated temporary password and copyable sign-in details
  - employee detail: edit details, salary, reset password, deactivate/reactivate
  - Teams and team detail: create, edit, set the manager, member list, delete when empty
  - routes `/api/org/invite`, `/reset-password`, `/set-active`
  - `check:rules` 70 of 70 and end-to-end 13 of 13 pass
- **M4 done** (2026-10-14, committed but not pushed):
  - Rules → Work rules: shift, working days, grace, full and half day, idle threshold, late penalty, with validation
  - Rules → Leave types: add, edit, delete
  - live rule changes reach everyone's app and the tracker side (main process) over IPC
  - end-to-end 14 of 14 pass
- **M5 done** (2026-10-14, committed but not pushed):
  - `tracker.ts` is the pure state machine (idle backdated to the last input, 5-minute roll, shift hours and working days, gaps between polls not counted); `engine.ts` feeds it from `powerMonitor` every 15 s and closes segments on lock, suspend and shutdown
  - `syncQueue.ts`: segments saved to disk first, created with a client-made id; a duplicate id counts as synced, a `segments.pb.js` rejection is logged and dropped, offline and server errors back off up to 5 min. PocketBase answers a create with a dead token with a bare 400, so that case re-checks the session instead of dropping the segment
  - `segments.pb.js` rejects segments that end before they start, run over 6 min, end more than 2 min in the future, are over 30 days old, or overlap
  - presence heartbeat every minute (and on every status change), today's totals counted by segment id so they never double count
  - tray with a status-coloured icon, today's time and Quit for managers and admins only; close-to-tray; one instance per PC; start at login (always on for employees)
  - main-process session: token refreshed at startup and every 12 h; on expiry the renderer goes to Login and segments keep queuing until the next sign-in. Signing out also keeps tracking as the last user (no pause button)
  - `check:rules` 72 of 72; end-to-end on the built app: segments land, offline sync with no duplicates and matching totals, expired session queues and syncs after sign-in, a 1-hour-ahead segment is rejected and logged, a second launch exits
- **M6 done** (2026-10-14, committed but not pushed):
  - My Stats: today's active and idle time straight from the tracker (including time not yet synced), a status badge, and this week by day
  - Live Board: one card per person with status, today's time and last check-in; realtime through a `presence` subscription; Offline after 2 minutes without a heartbeat; search, team and status filters. A manager sees only the teams they manage
  - Reports: `GET /api/reports/activity` (`reports.pb.js`, grouped SQL by day, week or month in Karachi time); filters for range, team and employee; CSV export with the same rows and total as the screen plus decimal hours. Managers are limited to their teams and employees are refused
  - end-to-end 17 of 17: idle reaches the board in under a second, the CSV matches the screen, and a manager sees only their team on both screens
- **M10a done** (2026-10-14, committed but not pushed):
  - Calendar → Holidays: a year view of holidays; admins add a single day or a range of up to 14 days (e.g. Eid), rename, move and delete
  - a date that is already a holiday is refused with the clashing holiday named; holidays on a non-working day are marked "Day off anyway"
  - everyone sees the list; employees, managers and an admin using "View as" lower roles get no edit controls (the API rules lock writes to admins)
  - end-to-end 12 of 12
- **M8 paused** (2026-10-14): the user stopped the M8 design run and asked to continue with the other modules one at a time. Attendance already reads approved leave, so it works without M8.
- **M7 done** (2026-10-14, committed but not pushed):
  - `lib/attendance.js`: `statusFor(day, settings, segments, leaves, holidays)` in the plan's order (holiday or weekend → on leave → absent → half day → late → present); first activity exactly at shift start + grace is still on time; idle time alone counts as absent
  - `attendance.pb.js`: nightly cron `0 20 * * *` (01:00 PKT) counts the 7 days just finished, so segments that synced late still count; `POST /api/attendance/recompute` (admins only, one date or a range of up to 31 days, finished days only). Both upsert records only between `joined_on` and `left_on`. The database side lives in `lib/attendance_store.js`, shared by both
  - Attendance grid (employees × days, team filter, row totals, hover details, Recompute for admins) and My Attendance (daily status, first/last activity, month totals)
  - `check:rules` 77 of 77; end-to-end 29 of 29, including grace boundaries, leave, holiday, weekend, the employment window, manager scope and the nightly job
- **M9 done** (2026-10-14, committed but not pushed):
  - `notifications.pb.js` + `lib/notifications.js`: a new pending leave request notifies the requester's team manager; a manager's or admin's own request, or one with no active team manager, goes to the admins; nobody is notified about their own request. Approved or rejected (including an admin reversing a decision) notifies the employee; cancelling notifies nobody. The payload stores names, dates and days so old notifications still read correctly
  - migration `1791960000`: the owner may only set `read_at` (the first schema let a notification be handed to someone else with made-up text)
  - Notification bell: unread badge, the latest 30, mark read on click (opens Approvals or My Leaves), mark all as read; live through a realtime subscription filtered to the current user
  - `check:rules` 87 of 87; end-to-end 16 of 16 (the manager's bell goes up 0.2 s after a new request)
- **M11 done** (2026-10-14, committed but not pushed):
  - `lib/payroll.js`: per-day rate = salary ÷ working days (weekends and holidays excluded); deductions = (absent + unpaid leave + ½ × half days) × rate + late × penalty, rounded to whole rupees; net = salary − deductions + adjustment. Unpaid leave is counted per working day inside the month (a request may span two months; 0.5 for a half day). No pro-rating: joiners and leavers are flagged for an adjustment
  - `POST /api/payroll/run` (admins, current month or earlier): recounts the month's attendance first, then builds the draft; recounting a draft keeps adjustments and notes; people with no salary are left out and named. Database side in `lib/payroll_store.js`
  - lock hooks in `payroll.pb.js`: runs start as drafts; a finalized run and its lines can't be edited, deleted, reopened, added to or recounted, by anyone including superusers; on a draft only the adjustment and note can change, and the server recomputes net
  - Finance → Payroll (run a month, runs list, detail with totals, per-employee breakdown dialog, adjustment and note, CSV export, finalize) and Finance → Salaries (inline edit, totals, missing-salary warning)
  - migration `1791970000`: a salary of 0 means "not set" (the required flag made adding an employee without a salary fail, an M3 bug)
  - `check:rules` 108 of 108; end-to-end 26 of 26 (net 87,595 matches the hand calculation; 78,071 with a −9,524 adjustment; finalized run read-only in the app and the API)
- **M10b done** (2026-10-14, committed but not pushed):
  - Calendar → Month (now the default tab): a Monday–Sunday month grid with holidays, approved leave on working days only ("who's off", ½ for a half day; pending leave is not shown) and events with their Karachi times; "+N more" and a day view with everything on that day; team filter for admins and managers
  - who sees what: events that are company-wide or for your own team (a manager also sees the teams they manage, an admin sees all); leave follows the API rules (your own, a manager's teams, everyone for an admin)
  - admins add, edit and delete events (timed or all day, company-wide or one team); `events.pb.js` rejects an event that ends before it starts
  - `check:rules` 115 of 115; end-to-end 27 of 27, including the "Done when" (an approved leave and a holiday on the same month view)
- **M12 code done** (2026-10-14, committed but not pushed). Decisions: office PC + Tailscale, installers on a public releases-only repo (`permanentseoteam-dev/agency-tracker-releases`), backups copied to the E: drive.
  - `electron-builder.yml`: per-user one-click NSIS installer with desktop and Start menu shortcuts, app icon (`scripts/make-icon.mjs` → `build/`), publish to the releases repo. `npm run dist` builds, `npm run release` publishes (needs `GH_TOKEN`); `scripts/check-release-env.mjs` refuses a build whose `VITE_PB_URL` is localhost, a raw IP or unset (`.env.production`)
  - `electron/main/updater.ts`: checks at start-up and every 6 h, downloads quietly, installs when nobody is being tracked (outside shift, screen locked) or when the app quits. The tray tooltip shows the version
  - `server/deploy/`: `install-service.ps1` (NSSM service, 30 s graceful stop, restart on crash, port 8090 open to Tailscale addresses only, no sleep), `backup-to-drive.ps1` + `register-backup-task.ps1` (nightly copy of PocketBase's 02:00 backup to E:, keeps 30), `restore-drill.ps1`. Step-by-step guide: [docs/deployment.md](docs/deployment.md)
  - verified on this PC: the packaged app signs in, tracks, reaches the server and registers start-with-Windows (locked for employees); a 0.1.0 install found, downloaded and installed 0.1.1 by itself and restarted as 0.1.1; backup → copy to the backup drive → restore drill passed. Test installs and startup entries were removed afterwards
  - **still to do by you before go-live:** create the releases repo and a `GH_TOKEN`, set up the office PC with docs/deployment.md, then tick the go-live checklist at the end of that guide (clean-PC install, reboot autostart, data on the production server, a published update, a restore from E:)
- **M8 done** (2026-10-14, pushed):
  - `leave.pb.js` + `lib/leave.js` (pure, Vitest) + `lib/leave_store.js`: the server counts `days` (working days from `org_settings.work_days`, holidays left out, a half day = 0.5 on one working day) whatever the client sends. A new request is refused when the dates are invalid or reversed, cover no working days, run past 60 days or across the new year, fall before `joined_on` or after `left_on`, overlap the person's own pending or approved leave, or take paid leave past the yearly quota (approved + pending that year). Unpaid types have no quota; past dates are allowed (sick leave sent afterwards). A new request is always saved as pending, with no approver
  - deciding: the owner may only cancel while pending; staff may change only the status and comment; managers approve or reject pending requests; a manager's or admin's own request is decided by an admin only; nobody decides their own; admins may also reverse (approved ↔ rejected) or cancel approved leave; a cancelled request can't be reopened. Approving counts the days again and re-checks overlap and quota against approved leave. The server stamps `approver` and `decided_at`
  - approved leave that appears or goes away on finished days re-counts that person's attendance for those days at once (`recomputeDays` takes an optional user), so payroll sees it without waiting for the nightly job
  - superusers (dashboard fixes, imports) are trusted: status kept, `days` filled in when missing
  - client data layer for the screens: `src/lib/leave.ts` (same rules for the Apply form preview, balance rows with used/pending/left, `allowedMoves` for the Approvals buttons; Vitest) and `src/features/leave/api.ts` (my leaves, balances view, pending queue, decided history, apply, cancel, decide)
  - `check:rules` 145 of 145 (`CHECK_RULES_PORT` overrides the port); unit tests 269 of 269
  - screens (core): **My Leaves** (balance cards per type with used / pending / left, the requests list with status, who decided and the comment, Cancel while pending) and the **Apply** dialog (type, dates, half day, reason; the same checks as the server shown as you type, and "N days will be counted"); **Approvals → Pending** (requester, type, dates, days, reason, paid days left; Approve / Reject with an optional comment; a manager gets no buttons on another manager's request). Both lists update live through a realtime subscription on `leave_requests`
  - end-to-end 24 of 24, including the "Done when": apply → approve → the Sick balance goes from 8 to 4 left, and the manager's own request never reaches their queue (the admin approves it)
  - Approvals tabs: **Pending**, **Decided** (the latest 50 decisions; admins can reject approved leave, approve a rejected request or cancel approved leave, with a comment; managers see the history only) and **Team balances** (people × leave types from the `leave_balances` view: days left of the quota and days used, search by name; a manager sees their teams, an admin everyone)
  - Live Board: **On leave** for someone offline with approved leave today (someone working anyway still shows Active or Idle); its own filter and count; updates live when leave is approved or cancelled
  - end-to-end 46 of 46 (including the admin reversing, re-approving and cancelling with the employee's balance following each time); `check:rules` 145 of 145; unit tests 271 of 271
  - fix (M6): the Live Board's people list is now live too (realtime on `users` and `teams`): a new hire, a deactivation or a newly assigned team shows within seconds without leaving the screen (it used to need navigating away and back). M6 end-to-end still 17 of 17
- **All roadmap modules (M0–M12) are built.** Go-live steps are in docs/deployment.md (see M12 above).

## 11. After the MVP
- **Ping & acknowledge:**
  - a `pings` collection
  - a manager pings an employee from the Live Board
  - a Windows notification with an "I'm here" button
  - a missed-ping alert to the manager after a set time
  - a response report: sent, answered, missed, average response time
  - a Focus / In a meeting status
- **Nightly Google Sheets export:** a PocketBase cron job copies attendance, payroll and hours to a read-only sheet for the client.
- **Slack integration:** the ping is sent as a Slack DM with an Acknowledge button. It needs a public HTTPS server address.
- **Email:** SMTP for "forgot password" and email notifications.
