# PocketBase — Beginner's Guide for Agency Tracker

This guide covers what you need to know about PocketBase to build and run Agency Tracker. It assumes you have never used it before.

Official docs: https://pocketbase.io/docs/ (the examples below follow PocketBase v0.23 and later).

---

## 1. What PocketBase is

PocketBase is **one program, `pocketbase.exe`**. Running it gives you a complete backend:

| Part | What it does for us |
|---|---|
| **Database** | SQLite, stored as files in the `pb_data/` folder. No database server to install. |
| **Auth** | User accounts, passwords and login tokens |
| **REST API** | Create, read, update and delete for every collection, with no code |
| **Realtime** | The app is told instantly when records change (used by the Live Board and the bell) |
| **File storage** | Uploaded files such as avatars |
| **Hooks** | Your own JavaScript that runs on the server (`pb_hooks/`) |
| **Cron** | Scheduled jobs, such as the nightly attendance run |
| **Admin dashboard** | A website to manage everything at `/_/` |
| **Backups** | Scheduled zip backups of all data |

It is free and open source. You only need a computer to run it on.

```
 Electron app (each employee's PC)                    Server PC
 ┌─────────────────────────┐   HTTP / realtime   ┌──────────────────────┐
 │ pocketbase npm SDK      │ ──────────────────► │ pocketbase.exe       │
 │ pb.collection('x')...   │ ◄────────────────── │  ├ pb_data/  (data)  │
 └─────────────────────────┘                     │  ├ pb_migrations/    │
                                                 │  └ pb_hooks/ (code)  │
                                                 └──────────────────────┘
```

---

## 2. Running it for the first time

1. Download `pocketbase_<version>_windows_amd64.zip` from https://github.com/pocketbase/pocketbase/releases.
2. Extract `pocketbase.exe` into `F:\agency-tracker\server\`.
3. Start it from the project folder:
   ```
   npm run pb
   ```
   This runs `server/pocketbase.exe serve --dir server/pb_data`.
4. The terminal prints:
   ```
   ├─ REST API:  http://127.0.0.1:8090/api/
   └─ Dashboard: http://127.0.0.1:8090/_/
   ```
   On the very first start it also opens or prints a link to **create your superuser** (the dashboard admin account). You can also create one from the command line:
   ```
   server\pocketbase.exe superuser upsert you@agency.com YourStrongPassword --dir server/pb_data
   ```
5. Open `http://127.0.0.1:8090/_/` and log in.

The folders next to `pb_data` are found automatically:
- `server/pb_data/`: the database and uploaded files (**never commit this**)
- `server/pb_migrations/`: schema history (**commit this**)
- `server/pb_hooks/`: server-side JavaScript (**commit this**)

To stop the server, press `Ctrl+C` in the terminal.

---

## 3. Core concepts

### Superusers vs app users
- **Superusers** log in to the dashboard and can do everything. They live in the system collection `_superusers`. This is you, the developer or owner.
- **App users** are employees. They live in the `users` **auth collection** and log in through the app. The Admin / Manager / Employee roles are a field on `users` that our app reads. They are not PocketBase superusers.

### Collections = tables
There are three kinds:

| Type | Use | Our examples |
|---|---|---|
| **Base** | Normal data | `teams`, `leave_requests`, `activity_segments` |
| **Auth** | Data plus login (email and password built in) | `users` |
| **View** | A read-only `SELECT` query shown as a collection | `leave_balances` |

Every record automatically gets:
- `id`: 15 random characters, e.g. `a1b2c3d4e5f6g7h`
- `created` and `updated` timestamps

### Fields
Created by clicking **+ New field** in the dashboard. The types we use: Plain text, Number, Bool, Email, Date, Select (fixed choices), JSON, File, and **Relation** (a link to a record in another collection, e.g. `leave_requests.user → users`).

To read a related record's data in the same request, use `expand`, e.g. `expand: 'user,leave_type'`.

### Indexes
In a collection's settings → **Indexes**, add a **unique** index where duplicates are not allowed, e.g. `attendance (user, date)` or `holidays (date)`.

### API rules = who can do what
Each collection has 5 rules: **List, View, Create, Update, Delete**. A rule is a filter expression:

| Rule value | Meaning |
|---|---|
| 🔒 Locked (empty/null) | **Superusers only.** This is the default, so the app gets "403/404" errors until you set it. |
| `""` (empty string, unlocked) | Anyone, even without logging in. Avoid this. |
| `@request.auth.id != ""` | Any logged-in user. Used for shared data such as teams, holidays and settings (read). |
| `user = @request.auth.id` | Only the record's owner, e.g. your own notifications |
| `@request.auth.role = "admin"` | Only users whose `role` field is admin, e.g. `salaries` and payroll |
| `@request.body.user = @request.auth.id` | On create: you can only create records for yourself, e.g. activity segments |
| `@request.body.role:isset = false` | On update: the request may not change `role` |

The exact rule for every collection is in the plan §5 rules table. Copy it as written.

> **Gotcha:** if the app gets empty lists or 404s for records that exist, either the API rule is still locked or it is correctly blocking that user. Check which user you are logged in as.
> **Gotcha:** a rule can't hide one field. That's why salaries live in their own `salaries` collection rather than on `users`.

---

## 4. Using it from the app (JavaScript SDK)

Install: `npm install pocketbase`. The shared client lives in `src/lib/pb.ts`:

```ts
import PocketBase from 'pocketbase'
export const pb = new PocketBase(import.meta.env.VITE_PB_URL) // http://127.0.0.1:8090
```

### Login / logout / current user
```ts
await pb.collection('users').authWithPassword(email, password)
pb.authStore.isValid        // true when logged in
pb.authStore.record         // the logged-in user record
pb.authStore.token          // pass this to the Electron main process
pb.authStore.onChange(() => { /* update the session store */ })
await pb.collection('users').authRefresh()   // at startup, renew the token
pb.authStore.clear()        // logout
```
The SDK saves the login in `localStorage`, so users stay logged in between app restarts.

### Read data
```ts
// all records (the SDK fetches every page for you)
const teams = await pb.collection('teams').getFullList({ sort: 'name', expand: 'manager' })

// one page
const page = await pb.collection('leave_requests').getList(1, 50, {
  filter: pb.filter('status = {:s} && start_date >= {:d}', { s: 'pending', d: '2026-10-01' }),
  sort: '-created',
  expand: 'user,leave_type',
})

// one record
const settings = await pb.collection('org_settings').getFirstListItem('')
const user = await pb.collection('users').getOne(id)
```
Always build filters with `pb.filter(...)` and `{:placeholders}`. Never glue user input into the filter string yourself.

Filter syntax: `=  !=  >  >=  <  <=  ~ (contains)  &&  ||`, with text in double quotes, e.g. `team = "abc123" && active = true`.

### Write data
```ts
await pb.collection('leave_requests').create({ user: me.id, leave_type: id, start_date, end_date, days, status: 'pending' })
await pb.collection('leave_requests').update(id, { status: 'approved', approver: me.id })
await pb.collection('holidays').delete(id)

// file upload (avatar): use FormData
const fd = new FormData(); fd.append('avatar', file)
await pb.collection('users').update(me.id, fd)
const url = pb.files.getURL(userRecord, userRecord.avatar)   // show it in <img>
```

### Realtime (Live Board, notification bell)
```ts
const unsubscribe = await pb.collection('presence').subscribe('*', (e) => {
  // e.action is 'create' | 'update' | 'delete', e.record is the changed record
})
// when leaving the screen:
unsubscribe()
```
The list and view API rules also control who receives realtime events.

### Errors
SDK calls throw a `ClientResponseError` with `err.status` (400 = validation, 401/403 = auth/rules, 404 = not found or blocked by a rule) and `err.response.data` (problems per field).

---

## 5. Server-side code: `pb_hooks`

Any file named `*.pb.js` in `server/pb_hooks/` runs inside PocketBase. **Saving a file reloads it automatically**, with no restart needed (on Windows, restart the server if a change doesn't seem to apply).

Things to know:
- It is plain JavaScript run by PocketBase's built-in engine. It is **not Node.js**, so `npm` packages and `fetch` aren't available (use `$http.send` for outside HTTP calls).
- Code runs **synchronously**: no `async`/`await` needed.
- `$app` is the app: use it to find, save and delete records and to run SQL.
- Each handler runs on its own. Put `require(...)` **inside** the handler, not at the top of the file.
- Hook handlers must call `e.next()` to continue the normal processing.

### A custom API route (example: add employee)
```js
// server/pb_hooks/invite.pb.js
routerAdd("POST", "/api/org/invite", (e) => {
  if (e.auth?.get("role") !== "admin") {
    throw new ForbiddenError("Only admins can add employees.")
  }
  const body = e.requestInfo().body   // { email, full_name, team, role, password, monthly_salary_pkr }
  let id
  $app.runInTransaction((txApp) => {  // user + salary are saved together or not at all
    const rec = new Record(txApp.findCollectionByNameOrId("users"))
    rec.set("email", body.email)
    rec.set("full_name", body.full_name)
    rec.set("team", body.team)
    rec.set("role", body.role || "employee")
    rec.set("must_change_password", true)
    rec.setPassword(body.password)
    txApp.save(rec)                   // throws on validation errors (e.g. duplicate email)

    const salary = new Record(txApp.findCollectionByNameOrId("salaries"))
    salary.set("user", rec.id)
    salary.set("monthly_salary_pkr", body.monthly_salary_pkr || 0)
    txApp.save(salary)
    id = rec.id
  })
  return e.json(200, { id })
}, $apis.requireAuth("users"))        // must be logged in; the role check above limits it to admins
```
From the app: `await pb.send('/api/org/invite', { method: 'POST', body: { ... } })`.

### Reacting to record changes (example: notifications)
```js
// server/pb_hooks/notifications.pb.js
onRecordAfterCreateSuccess((e) => {
  const req = e.record
  const user = $app.findRecordById("users", req.get("user"))
  const team = $app.findRecordById("teams", user.get("team"))
  const n = new Record($app.findCollectionByNameOrId("notifications"))
  n.set("user", team.get("manager"))
  n.set("type", "leave_requested")
  n.set("payload", { request: req.id, from: user.get("full_name") })
  $app.save(n)
  e.next()
}, "leave_requests")
```
Other useful hooks: `onRecordAfterUpdateSuccess`, `onRecordUpdateRequest` (runs before an API update, so it can reject one by throwing), `onRecordDeleteRequest`.

### Scheduled jobs (example: nightly attendance)
```js
// server/pb_hooks/attendance.pb.js
cronAdd("attendance", "0 20 * * *", () => {   // cron runs in UTC: 20:00 UTC = 01:00 PKT
  const lib = require(`${__hooks}/lib/attendance.js`)
  // load settings, segments, leaves, holidays for yesterday → lib.statusFor(...) → save attendance
})
```
Registered jobs appear in the dashboard under **Settings → Crons**, where you can also run them by hand.

### Sharing logic with unit tests
`server/pb_hooks/lib/attendance.js` and `payroll.js` are plain CommonJS with **no** `$app` calls:
```js
// server/pb_hooks/lib/payroll.js
function calcPayroll(input) { /* pure math */ return { deductions, net } }
module.exports = { calcPayroll }
```
Hooks `require` them, and Vitest imports the same files. The business rules exist in one place only.

### Finding records and running SQL in hooks
```js
const recs = $app.findRecordsByFilter(
  "activity_segments",
  "user = {:u} && started_at >= {:from} && started_at < {:to}",
  "started_at", 0, 0,                       // sort, limit (0 = all), offset
  { u: userId, from: "2026-10-13 19:00:00.000Z", to: "2026-10-14 19:00:00.000Z" }
)

const rows = arrayOf(new DynamicModel({ user: "", active_s: 0 }))
$app.db()
  .newQuery("SELECT user, SUM(...) AS active_s FROM activity_segments WHERE ... GROUP BY user")
  .all(rows)
```

---

## 6. Migrations and git

- When you change collections in the dashboard, PocketBase **writes a migration file** into `server/pb_migrations/` automatically (e.g. `1760000000_created_teams.js`).
- **Commit these files.** When the server starts on another machine, it applies any migrations it hasn't run yet, so the production schema always matches yours.
- You can also write migrations by hand, e.g. our seed data:
  ```js
  // server/pb_migrations/1760000100_seed.js
  migrate((app) => {
    const r = new Record(app.findCollectionByNameOrId("org_settings"))
    r.set("shift_start", "09:00"); r.set("shift_end", "18:00")
    r.set("work_days", [1, 2, 3, 4, 5]); r.set("grace_minutes", 15)
    app.save(r)
  }, (app) => { /* undo: delete what was added */ })
  ```
- **Never commit `pb_data/`.** It holds the real data and password hashes.

---

## 7. Backups and protecting against a dead or corrupted server

All data lives in `pb_data/` on the server's disk. If Windows on that machine gets corrupted (a failed update, a dying disk, ransomware, someone reinstalling Windows), backups stored in `pb_data/backups/` are lost with it. **A backup only protects you if a copy lives on a different machine.** Set up all four layers below. They are all free.

### Layer 1 — Automatic off-site backups (the main protection)
1. Create a free bucket at **Cloudflare R2** (10 GB free) or **Backblaze B2** (10 GB free). Generate an access key with read and write access to that bucket only.
2. Dashboard → **Settings → Backups**:
   - Turn on **auto backups** with cron `0 21 * * *`, which is 02:00 PKT, after the 01:00 attendance cron. Keep the last **14**.
   - Turn on **Use S3 storage** and fill in:
     - **endpoint**: R2 is `https://<account-id>.r2.cloudflarestorage.com`, B2 is `https://s3.<region>.backblazeb2.com`
     - **bucket**, **region** (R2: `auto`), **access key** and **secret**
   - Click **Test connection**, then **Save**.
3. Click **Backup now** once and check that the zip shows up in the bucket.

Each daily backup now goes straight to the cloud. If the server dies, you lose at most the data since the last backup.

### Layer 2 — Keep the data off the C: drive (office PC only)
Reinstalling Windows wipes C:. Put `pb_data` on a second disk or partition, for example `D:\pocketbase\pb_data` (see §8). The program, `pb_hooks/` and `pb_migrations/` don't need protecting because they can be rebuilt from git.

### Layer 3 — Prevent corruption from unsafe shutdowns
SQLite only gets corrupted when it is cut off in the middle of a write. To prevent that:
- Let NSSM stop PocketBase cleanly when Windows shuts down: `nssm set PocketBase AppStopMethodConsole 30000`.
- Plug the server PC into a **UPS**, so a power cut doesn't kill it mid-write.
- Turn off sleep. In Windows Update, set **active hours** to cover the working day so it doesn't reboot during work.
- **Never copy `pb_data/` while the server is running.** Use **Backup now** instead, which takes a consistent snapshot. A manual folder copy is only safe after `nssm stop PocketBase`.

### Layer 4 — Test a restore every month
A backup you've never restored can't be trusted. Once a month:
1. Download the latest zip from the bucket and unzip it into an empty folder, e.g. `C:\restore-test\pb_data`.
2. Run `pocketbase.exe serve --http 127.0.0.1:8099 --dir C:\restore-test\pb_data`.
3. Open `http://127.0.0.1:8099/_/`, log in and check that the users and yesterday's activity segments are there. Then stop it and delete the folder.

### Disaster recovery: the server is gone
1. On the new PC or VM, clone the repo and download `pocketbase.exe` (or the Linux build).
2. Start it with an empty `pb_data` and create a superuser.
3. Dashboard → Settings → Backups → enter the same S3 settings. The bucket's backups appear in the list. Click **Restore** on the newest one. Or download the zip and unzip it into `pb_data/` while the server is stopped.
4. If the server's address changed, update the Tailscale name, the DNS record or `VITE_PB_URL`.

Employee PCs keep queuing activity segments while the server is down, and they sync them once it is back (see `syncQueue.ts` in plan.md). So tracking data from the outage is not lost.

> **Strongest option:** host on the Oracle Cloud VM (§8 Option B). It takes Windows out of the picture entirely. Keep the S3 backups there too.

---

## 8. Going live (production)

All options below are free.

### Option A — An always-on office PC
1. Copy `pocketbase.exe`, `pb_migrations/` and `pb_hooks/` to e.g. `D:\pocketbase\`. Use a non-system drive so a Windows reinstall doesn't touch the data (see §7).
2. Install it as a Windows service so it starts on boot, using **NSSM** (https://nssm.cc):
   ```
   nssm install PocketBase D:\pocketbase\pocketbase.exe serve --http 0.0.0.0:8090 --dir D:\pocketbase\pb_data
   nssm set PocketBase AppStopMethodConsole 30000
   nssm start PocketBase
   ```
   The `AppStopMethodConsole` line gives PocketBase 30 s to finish its writes when Windows shuts down.
3. Set up the S3 off-site backups and the UPS from §7 before staff start using it.
4. Choose how staff reach it:
   - **Everyone in the office:** use `http://<server-PC-IP>:8090` and allow port 8090 in Windows Firewall.
   - **Some staff work remotely:** install **Tailscale** (free for up to 100 devices) on the server and on each employee's PC, then use `http://<server-tailscale-name>:8090`. No domain or open ports are needed.
   - **Public HTTPS address:** use a **Cloudflare Tunnel** (`cloudflared`). This needs a domain managed in Cloudflare (free plan).
5. The PC must stay on and must not sleep during working hours.

### Option B — Oracle Cloud Always Free VM
1. Create an Always Free Ubuntu VM. Oracle asks for a card to verify you, but nothing is charged on Always Free.
2. Upload the Linux build of PocketBase together with `pb_migrations/` and `pb_hooks/`.
3. Point a domain or subdomain at the VM and run `./pocketbase serve tracker.yourdomain.com`. PocketBase gets an HTTPS certificate automatically.
4. Run it as a systemd service so it restarts on reboot. Open ports 80 and 443 in the Oracle security list.

Finally, build the app with `VITE_PB_URL` set to the production address.

---

## 9. How Agency Tracker uses PocketBase

| Feature | Collections | Server code |
|---|---|---|
| Login & profile | `users` (auth) | — |
| Add employee | `users` | `invite.pb.js` → `POST /api/org/invite` |
| Teams, rules | `teams`, `org_settings`, `leave_types` | — |
| Tracking | `activity_segments`, `presence` (realtime) | `reports.pb.js` → `GET /api/reports/activity` |
| Attendance | `attendance` | `attendance.pb.js` (cron + `POST /api/attendance/recompute`), `lib/attendance.js` |
| Leave | `leave_requests`, `leave_balances` (view) | — |
| Notifications | `notifications` (realtime) | `notifications.pb.js` |
| Calendar | `holidays`, `events` | — |
| Payroll | `salaries`, `payroll_runs`, `payroll_items` | `payroll.pb.js` (`POST /api/payroll/run`, finalize lock), `lib/payroll.js` |

The full field list is in [plan.md §5](../plan.md).

---

## 10. Common gotchas

| Symptom / situation | Cause and fix |
|---|---|
| App gets 403, 404 or empty lists | The API rule is still **locked** (superusers only), or it is correctly blocking that user's role. Compare it with the plan §5 rules table. |
| Times look 5 hours off | PocketBase stores **UTC**. Convert to Asia/Karachi for display (`src/lib/dates.ts`). |
| Cron ran at the wrong hour | Cron expressions are **UTC**. 01:00 PKT = `0 20 * * *`. |
| View collection won't save | The `SELECT` must return a unique `id` column, e.g. `(u.id || lt.id) AS id`. |
| Custom record id rejected | Ids must be **15 characters**, lowercase letters and digits only. |
| Hook change not taking effect | Check the server terminal for errors. Restart the server if needed. |
| `require` not found | Use `require(`${__hooks}/lib/file.js`)` **inside** the handler. |
| Filter fails with a quoting error | Use `pb.filter('field = {:v}', { v })` instead of building strings. |
| Lost data after copying the project | `pb_data/` isn't in git (on purpose). Restore it from a backup. |
| Server PC crashed / Windows corrupted / `database disk image is malformed` | Follow "Disaster recovery" in §7: restore the newest backup from the S3 bucket. Then check the UPS and the NSSM graceful-stop setting. |
