# Running PSEO Tracker: server, installer, updates and backups

How PSEO Tracker runs for the whole agency since the move to Supabase, and the steps to set it up or change it. The move itself (one evening) is in [switch-over.md](switch-over.md).

- **Server:** the **live** Supabase project (free plan), hosted by Supabase: the database, sign-in, live updates, server functions and profile pictures. No office PC has to be on for the app to work.
- **Testing:** a second free project, **staging**, is only for tests (`npm run test:env`, `npm run check:rules`); see [testing/README.md](testing/README.md).
- **Keys:** `.env.supabase` (git-ignored, on this PC only) holds both projects' URLs, keys and database passwords. Only the live URL and its anon key go into the app (`.env.production`); the anon key is meant to be public. Never commit or paste the service-role key or a database password.
- **Backups:** this PC copies the live project to `E:\PSEOTrackerBackups\supabase` every day at 13:30 (the free plan has no backups of its own).
- **Updates:** installers are GitHub Releases of this repo, `permanentseoteam-dev/Agency-Employee-Tracking`; installed apps update themselves from there.

---

## Part A: the Supabase projects

**Changing the server** (a new migration in `supabase/migrations`, or a changed function in `supabase/functions`): try it on staging first, then:

```
npx supabase@2.121.0 db push --db-url <project database URL>
node scripts/build-edge-shared.mjs
npx supabase@2.121.0 functions deploy --project-ref <ref>
npx supabase@2.121.0 functions deploy register --no-verify-jwt --project-ref <ref>
```

- The database URL is `postgresql://postgres.<ref>:<database password>@<pooler host>:5432/postgres`, from the project's *Connect* page (encode special characters in the password).
- `register` is deployed on its own with `--no-verify-jwt`: "Create an account" is used before anyone is signed in.
- `node scripts/supabase-secrets.mjs live|staging` stores the project URL and service key in the project's Vault, for the hourly attendance job. Needed once per project.
- `scripts/build-edge-shared.mjs` copies the shared logic (leave, attendance, payroll, stars…) into the functions, so Vitest and the server use the same code.

**Settings that live on supabase.com** (Authentication): "Allow new users to sign up" off (accounts come only from the app's functions) and "Confirm email" off (there is no email service).

**What protects the data:** row-level security on every table, guard triggers (segments, payroll locks, event times, star rules, profiles), and each function checks the caller's role. `npm run check:rules` proves it: 240 checks against staging.

**Free plan limits:** 500 MB of database (an admin's **Settings → Database** shows how much is used), 5 GB of traffic a month, 200 live connections (about 100 PCs), and a project pauses after a week with no use (the daily backup prevents that; if it ever pauses, click **Restore** in the dashboard).

---

## Part B: staff PCs and laptops (about 2 minutes each)

1. On the PC, download `PSEO-Tracker-Setup-<version>.exe` from the repo's **Releases** page (or copy it by USB) and run it. Windows SmartScreen may warn the first time: **More info**, then **Run anyway**. Nothing else needs installing; any internet connection works.
2. The employee either:
   - **signs in** with the email and temporary password you gave them (**Organization → Add employee**), then chooses a new password, or
   - clicks **Create an account**. The account waits for your approval: you get a bell notification, and **Organization → Employees → Waiting for approval** has **Approve** (switches it on, joined today; then set team, role, designation and salary) and **Reject** (deletes it).
3. After signing in they accept the tracking notice. During shift hours the **Live Board** shows them Active or Idle within a minute.

From then on the app starts by itself (in the tray) at every Windows sign-in and records active and idle time during shift hours; employees can't turn that off. Without internet it keeps recording and sends the time later (up to 30 days).

**When someone leaves:** deactivate them in **Organization**. They are signed out everywhere at once.

---

## Part C: updates

1. Raise `"version"` in `package.json` and commit.
2. `.env.production` must hold the **live** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`scripts/check-release-env.mjs` refuses anything else, including a service-role key).
3. With `GH_TOKEN` set, `npm run release` builds `dist\PSEO-Tracker-Setup-<version>.exe` and publishes the GitHub release `v<version>` (installer, `.blockmap`, `latest.yml`). If GitHub shows a draft, publish it. `npm run dist` builds without publishing. Release builds go to `out-release\`, never `out\`.

Installed apps check at start-up and every 6 hours and download quietly. With nobody being tracked the update installs at once; otherwise a Windows notification offers "restart and update now", and it installs by itself the next time nobody is tracked or the app quits.

---

## Part D: backups and restoring

**Setting up the daily backup (once):**
1. The Postgres 17 tools (portable, no install) go in `%LOCALAPPDATA%\PSEO Tracker Tools\pgsql\bin`: from the EDB "binaries" zip for PostgreSQL 17.x, only the `pgsql\bin` folder is needed (about 75 MB).
2. In PowerShell **as Administrator**, in `F:\agency-tracker`:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\register-supabase-backup-task.ps1
   ```
   Every day at 13:30 (or as soon as the PC is on again) `scripts/backup-supabase.mjs live` writes `E:\PSEOTrackerBackups\supabase\live-<date>-<time>\` with `data.dump` (every table plus the accounts and their password hashes) and `avatars\`, keeps 14 days, and logs each run in `backup.log` there.
3. Test it: `Start-ScheduledTask -TaskName "PSEO Tracker Supabase backup"`, then check `backup.log`.

E: protects against losing the Supabase project, not against losing this PC. Now and then copy the newest backup folder to a USB drive or cloud storage kept elsewhere.

**Restore drill** (every few months, on staging; the live project isn't touched):
```
node scripts/restore-supabase.mjs E:\PSEOTrackerBackups\supabase\live-<date>-<time> --to staging --reset
```
It prints the row counts; sign in to a staging test build to look around. Afterwards `npm run test:env -- --stop` puts staging back to its default rows.

**Restoring for real** (the live project is lost or damaged):
1. Create a new free project, push the schema and functions to it (Part A), and store its keys in `.env.supabase` as `LIVE_*`.
2. `node scripts/restore-supabase.mjs E:\PSEOTrackerBackups\supabase\live-<date>-<time> --to live` (it refuses a project that already has data).
3. If the project's address changed, release an update with the new `.env.production` (Part C).

Anything recorded after that backup is lost, at most a day, except time a staff PC hadn't sent yet, which the app still sends.

---

## The old PocketBase server

Until the switch-over, the office PC runs PocketBase (service "PocketBase", from its own copy in `D:\PSEOTracker`, reached through Tailscale Funnel). Its setup and deploy scripts are no longer in this branch; they stay on `main` (`server\deploy\setup-server.ps1`) until the switch-over merge. After the switch it stays on for one week as a fallback ([switch-over.md](switch-over.md)); then stop the service (`Stop-Service PocketBase`), turn off Funnel (`tailscale funnel --https=443 off`) and keep `D:\PSEOTracker` as an archive. Staff PCs need neither Tailscale nor the old office setup file.

---

## Go-live checklist

- [ ] The live project has the schema, functions and Vault secrets, and the Auth settings above.
- [ ] The real-data dry run on staging ended with "Done: everything matches."
- [ ] The switch-over evening ([switch-over.md](switch-over.md)) and the 0.2.0 release.
- [ ] A staff PC updated to 0.2.0, signed in, shows on the Live Board, and its time appears in Reports.
- [ ] The daily backup task ran and `backup.log` shows the live backup.
- [ ] A backup has been restored into staging with `restore-supabase.mjs`.
