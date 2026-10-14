# Going live: server, installer, updates and backups

This is how PSEO Tracker runs for the whole agency (roadmap M12), and the steps to set it up.

- **Server:** an office PC runs the database (PocketBase) as the Windows service "PocketBase" from `D:\PSEOTracker`. On Tailscale it is called **agency-server**.
- **Network:** staff PCs and laptops reach it over **Tailscale**, a free private network, under the agency's Tailscale account. The app connects to `http://agency-server:8090`. Nothing is opened to the internet: the firewall lets only Tailscale addresses reach port 8090.
- **Backups:** PocketBase makes a backup zip every day at 13:00 (Pakistan time). A scheduled task copies it to `E:\PSEOTrackerBackups` at 13:30, or as soon as the PC is on again.
- **Updates:** installers go to a public, releases-only GitHub repo, `permanentseoteam-dev/pseo-tracker-releases`, and installed apps update themselves from there (Part D).

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

## Part B: the Tailscale admin console (once, about 5 minutes)

Open <https://login.tailscale.com/admin> and sign in with the agency's Tailscale account.

1. **Keep the server connected.** Open **Machines**, then the **⋯** menu on `agency-server`, and choose **Disable key expiry**. Otherwise Tailscale signs the server out after 180 days.
2. **Let staff PCs reach only the tracker.** Open **Access controls**, replace everything in the editor with the policy below, and click **Save**:
   ```jsonc
   {
     // Only tailnet admins (you) may give devices the tag:staff label.
     "tagOwners": {
       "tag:staff": ["autogroup:admin"],
     },
     // The server's Tailscale address: replace 100.x.y.z with the one shown under Machines > agency-server.
     "hosts": {
       "agency-server": "100.x.y.z",
     },
     "grants": [
       // Your own devices, signed in with the agency account, can reach everything.
       {"src": ["autogroup:member"], "dst": ["*"], "ip": ["*"]},
       // Staff PCs and laptops can reach only PSEO Tracker on the server, not each other or your files.
       {"src": ["tag:staff"], "dst": ["host:agency-server"], "ip": ["tcp:8090"]},
     ],
   }
   ```
   If the server is ever set up again and gets a new Tailscale address, update `hosts`.
3. **Make a key for staff PCs.** Open **Settings → Keys → Generate auth key**:
   - **Reusable:** on
   - **Expiration:** 90 days
   - **Tags:** `tag:staff`

   Click **Generate** and copy the key, which starts with `tskey-auth-`. It is shown only once, so keep it somewhere private. Devices joined with it are tagged, so they never need signing in again.
4. **Optional check from your phone:** install the Tailscale app, sign in with the agency account, and open `http://agency-server:8090/api/health` in the phone's browser. It should say `API is healthy`. That proves other devices can reach the server.

---

## Part C: staff PCs and laptops (about 5 minutes each)

**Before you start:** in the app, add the employee (**Organization → Add employee**) and note their email and temporary password.

1. Copy the folder `F:\agency-tracker\dist\staff-pc-setup` to the PC (USB stick or Google Drive). It holds the installer, the Tailscale installer, `Set up this PC.cmd` and a short `README.txt`.
2. On the PC, signed in to Windows **as the employee**, double-click **Set up this PC.cmd**. Click **Yes** when Windows asks, and paste the auth key from Part B when asked. The script ([setup-staff-pc.ps1](../scripts/staff-pc/setup-staff-pc.ps1)):
   - installs Tailscale and joins the agency network
   - checks that `agency-server` answers
   - installs PSEO Tracker for that Windows user and opens it
3. The employee signs in, chooses a new password and accepts the tracking notice.
4. Check the **Live Board**: during shift hours they show as Active or Idle within a minute.

From then on the app starts by itself (hidden in the tray) at every Windows sign-in and records active and idle time during shift hours. Employees can't turn that off. Laptops work anywhere with internet. Without a connection they keep recording and send the time later.

**Tip:** to skip pasting the key, put it in `tailscale-key.txt` inside the folder before copying it, and delete that file afterwards.

**When someone leaves:** deactivate them in the app (**Organization**), and remove their PC under **Machines** in the Tailscale admin console.

---

## Part D: updates

**One-time setup:**
1. On GitHub, create an **empty public** repo, `permanentseoteam-dev/pseo-tracker-releases`. It holds only installers; the source code stays private.
2. Create a GitHub token (**Settings → Developer settings → Personal access tokens**) with `repo` access to it.

**Each update:**
1. Raise `"version"` in `package.json`, e.g. `0.1.0` → `0.2.0`, and commit.
2. In PowerShell in `F:\agency-tracker`:
   ```powershell
   $env:GH_TOKEN = 'ghp_…'
   npm run release
   ```
   This builds `dist\PSEO-Tracker-Setup-<version>.exe` and publishes a GitHub release. If GitHub shows it as a draft, publish it.
3. Copy the new installer into `dist\staff-pc-setup` (delete the old one), so new PCs get the latest version.

Installed apps check at start-up and every 6 hours, download quietly, and install the update when nobody is being tracked on that PC (outside shift hours, or with the screen locked) or when the app quits.

Until the releases repo exists, the check fails quietly in the app log (`updater: 404`) and nothing else happens. Apps installed today will update themselves once a newer release is published.

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
