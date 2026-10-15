# Going live: server, installer, updates and backups

This is how PSEO Tracker runs for the whole agency (roadmap M12), and the steps to set it up.

- **Server:** an office PC runs the database (PocketBase) as the Windows service "PocketBase" from `D:\PSEOTracker`. On Tailscale it is called **agency-server**.
- **Network:** the app reaches the server over the normal internet at `https://agency-server.<your-tailnet>.ts.net`, published by Tailscale Funnel on this PC (only `/api`; Part B). Staff PCs need only the app. Sign-ups wait for an admin's approval.
- **Backups:** PocketBase makes a backup zip every day at 13:00 (Pakistan time). A scheduled task copies it to `E:\PSEOTrackerBackups` at 13:30, or as soon as the PC is on again.
- **Updates:** installers are published as GitHub Releases of this repo, `permanentseoteam-dev/Agency-Employee-Tracking`, and installed apps update themselves from there (Part D).

**Status on 2026-10-14:**
- [x] Part A: the server is set up on the office PC, with the first admin login.
- [x] The installer is built (`dist\PSEO-Tracker-Setup-0.1.0.exe`) and installed on the server PC.
- [ ] Part B: the Tailscale admin console steps.
- [ ] Part C: the first staff PC.
- [ ] Part D: the GitHub releases repo for automatic updates.

---

## Part A: the server PC (done; repeat only for a new server)

1. The PC needs this repo with `server\pocketbase.exe`, a D: drive for the database and an E: drive for backups.
2. Open PowerShell **as Administrator** and run:
   ```powershell
   cd F:\agency-tracker\server\deploy
   powershell -ExecutionPolicy Bypass -File .\setup-server.ps1
   ```
   [setup-server.ps1](../server/deploy/setup-server.ps1) does everything in one go and writes a log to `D:\PSEOTracker\setup-log.txt`:
   1. copies `pocketbase.exe`, `pb_migrations`, `pb_hooks` and `deploy` to `D:\PSEOTracker\server`
   2. turns off the development database, the task "PSEO Tracker Database", which used port 8090
   3. installs the service "PocketBase" with NSSM ([install-service.ps1](../server/deploy/install-service.ps1)). It starts at boot, restarts after a crash, opens port 8090 to Tailscale addresses only, and turns off sleep on mains power
   4. schedules the daily backup copy to E: ([register-backup-task.ps1](../server/deploy/register-backup-task.ps1))
   5. on the first run, asks for your email, name and a password, and creates both the dashboard login and your admin account in the app ([create-first-admin.ps1](../server/deploy/create-first-admin.ps1)). It then makes a first backup and tests the copy to E:
   6. installs Tailscale (always on, even before anyone signs in to Windows) and signs the PC in as `agency-server`; your browser opens for the Tailscale sign-in
3. Sign in to the app and set **Rules** (shift, working days, grace, idle threshold, late penalty) and this year's **Calendar → Holidays**. A new database starts with 09:00–18:00, Monday to Friday, and a 5-minute idle threshold.

The script is safe to run again: finished steps are skipped or refreshed. Run it again (as Administrator) whenever `pb_hooks` or `pb_migrations` change. That is how server changes go live: the service runs the copy in `D:\PSEOTracker\server`, not the repo.

**Living with the server PC:**
- Keep it on during work hours. It may be off at night: attendance is recounted every hour for the past 7 days, and the backup runs at 13:00. While it's off, staff apps keep recording and send the time later, for up to 30 days.
- A UPS is strongly recommended. A network cable is better than Wi-Fi if one is near.
- Port 8090 on this PC is now the live database. Tests never use it: they run on throwaway databases (`npm run test:env` on 8099, `npm run check:rules` on 8097).
- The old development data is still in `F:\agency-tracker\server\pb_data`, unused.
- Dashboard (on this PC only): `http://127.0.0.1:8090/_/`.

---

## Part B: the public address (Tailscale Funnel)

The app reaches the server over the normal internet at `https://agency-server.<your-tailnet>.ts.net`. Tailscale Funnel on this PC provides that address, with a real HTTPS certificate and no router changes. Staff PCs and laptops need nothing but the app. Tailscale runs only on the server.

**Turning it on (once):**
1. Funnel must be allowed for the tailnet. The first `tailscale funnel` command prints a link for that; open it while signed in as the agency account and enable it.
2. In PowerShell on this PC:
   ```powershell
   & 'C:\Program Files\Tailscale\tailscale.exe' funnel --bg --yes --https=443 --set-path=/api http://127.0.0.1:8090/api
   ```
   Only `/api` is published. The database dashboard (`/_/`) stays reachable only on this PC.
3. Check with `tailscale funnel status`; it should list `/api` → `http://127.0.0.1:8090/api`. To switch it off: `tailscale funnel --https=443 off`.

**What protects the server once it's public:**
- **Sign-ups wait for an admin:** "Create an account" makes an account that is switched off until you approve it (Part C).
- **The dashboard is local-only:** superuser sign-in and superuser requests that arrive through Funnel are refused (`security.pb.js`). Funnel marks every request it carries with `X-Forwarded-For`.
- **Rate limits per visitor:** 5 sign-ups and 30 sign-ins a minute (migration `1792000000`).
- **Passwords and the server's API rules**, as before.

Notes: this PC must be on for anyone to sign in or register. Funnel traffic has bandwidth limits; this app's traffic is tiny. Tailscale's free plan says it isn't meant for business use.

The office setup file and the Tailscale staff key (`.env.office`, `npm run office-setup`) are no longer needed for staff PCs. Keep them only if you ever want PCs on the private network again.

---

## Part C: staff PCs and laptops (about 2 minutes each)

1. On the PC, download `PSEO-Tracker-Setup-<version>.exe` from the repo's **Releases** page on GitHub (or copy it by USB) and run it. Windows SmartScreen may warn the first time: click **More info**, then **Run anyway**. Nothing else needs installing.
2. The employee either:
   - **signs in** with the email and temporary password you gave them (**Organization → Add employee**), then chooses a new password, or
   - clicks **Create an account** and enters their name, email and a password. They see "Account created. It now waits for your admin's approval".
3. **Approving a sign-up:** you get the bell notification "New sign-up waiting for approval". Open **Organization → Employees**: the box **Waiting for approval** lists them.
   - **Approve** switches the account on, with today as the joining date. Then open them and set their team, role, designation and salary.
   - **Reject** deletes the sign-up.
   - Until approved, signing in says the account is waiting, and they don't appear in attendance, payroll or the Live Board.
4. After signing in they accept the tracking notice. Check the **Live Board**: during shift hours they show as Active or Idle within a minute.

From then on the app starts by itself (hidden in the tray) at every Windows sign-in and records active and idle time during shift hours. Employees can't turn that off. Without internet the app keeps recording and sends the time later. If the server can't be reached while signed out, the app shows "Can't reach the server" and opens sign-in by itself once it can.

**When someone leaves:** deactivate them in the app (**Organization**).

---

## Part D: updates

Releases go to the **Releases** page of this repo, `permanentseoteam-dev/Agency-Employee-Tracking`. It's public, so apps download updates without a token. Publishing needs GitHub access with `repo` rights: the git login this PC pushes with, or a token in `GH_TOKEN`.

**Versions before 0.1.3** were built to look for updates in a repo that was never created (`pseo-tracker-releases`). Each PC that has one of them needs **one manual install of 0.1.3 or later** from `dist\staff-pc-setup`. After that it updates itself.

**Each update:**
1. Raise `"version"` in `package.json`, e.g. `0.1.3` → `0.1.4`, and commit.
2. In PowerShell in `F:\agency-tracker`, with `GH_TOKEN` set, run `npm run release`. It builds `dist\PSEO-Tracker-Setup-<version>.exe` and publishes the GitHub release `v<version>` with the installer, its `.blockmap` and `latest.yml` (the file the apps check). If GitHub shows it as a draft, publish it.
3. Copy the new installer into `dist\staff-pc-setup` (delete the old one), so new PCs get the latest version.

Installed apps check at start-up and every 6 hours and download quietly. When nobody is being tracked on that PC (outside shift hours, or with the screen locked), the update installs at once. If someone is being tracked, a **Windows notification** appears: "PSEO Tracker <version> is ready. Click here to restart and update now…". Clicking it restarts into the new version in about 10 seconds and keeps the tracked time. If it's ignored, the update installs by itself the next time nobody is being tracked, or when the app quits. On the first start of the new version, a notification says "PSEO Tracker updated to <version>". (From the first version that has this onward; 0.1.3 updates quietly.)

If there is no release to find, the check fails quietly in the app log (`updater: 404`) and nothing else happens.

`npm run dist` builds the same installer without publishing. Release builds go to `out-release\`, never `out\`, so building one doesn't disturb a running development copy. The server address comes from `.env.production` (`VITE_PB_URL=http://agency-server:8090`); the build refuses `localhost` or a raw IP.

---

## Backups and restoring

- PocketBase keeps the last 14 daily backups in `D:\PSEOTracker\pb_data\backups`; E: keeps 30. Each copy adds a line to `E:\PSEOTrackerBackups\backup-log.txt`.
- E: protects against a failed D: drive or a corrupted database, but not against theft, fire or ransomware. Now and then, copy the newest zip to a USB drive or cloud storage kept elsewhere.
- **Restore drill** (every few months): `powershell -ExecutionPolicy Bypass -File .\restore-drill.ps1 -BackupDir E:\PSEOTrackerBackups` in `D:\PSEOTracker\server\deploy`. It restores the newest zip into a temporary copy on port 8099, prints the record counts and deletes the copy. The live server isn't touched.

**Restoring for real** (PowerShell as Administrator):
1. `Stop-Service PocketBase`
2. Rename `D:\PSEOTracker\pb_data` to `pb_data-broken`, and keep it until you're sure.
3. Unzip the chosen backup from `E:\PSEOTrackerBackups` into a new, empty `D:\PSEOTracker\pb_data`.
4. `Start-Service PocketBase`, then check the app.

Anything recorded after that backup is lost, at most a day. The exception is time a staff PC hadn't sent yet, which the app still sends.

---

## Go-live checklist (roadmap M12 "Done when")

- [x] The server answers at `http://agency-server:8090` over Tailscale, and the first backup reached E: (2026-10-14).
- [x] The installer installs and starts on the server PC, registers start-with-Windows, and reaches the server (2026-10-14).
- [ ] The installer runs on a staff PC or laptop. The Live Board shows that person Active or Idle, and their time appears in Reports.
- [ ] After a reboot of that PC, the app starts by itself in the tray.
- [ ] A published higher version installs itself on that PC. Hover the tray icon: the tooltip shows the version.
- [ ] A backup zip from E: has been restored with `restore-drill.ps1`.
- [ ] The manual end-to-end steps in plan.md §8 pass against the production server.
