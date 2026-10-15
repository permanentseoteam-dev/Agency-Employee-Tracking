# Going live: server, installer, updates and backups

This is how PSEO Tracker runs for the whole agency (roadmap M12), and the steps to set it up.

- **Server:** an office PC runs the database (PocketBase) as the Windows service "PocketBase" from `D:\PSEOTracker`. On Tailscale it is called **agency-server**.
- **Network:** staff PCs and laptops reach it over **Tailscale**, a free private network, under the agency's Tailscale account. The app connects to `http://agency-server:8090`. Nothing is opened to the internet: the firewall lets only Tailscale addresses reach port 8090.
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

   Click **Generate** and copy the key, which starts with `tskey-auth-`. It is shown only once. Paste it into `F:\agency-tracker\.env.office` as one line, `TS_AUTHKEY=tskey-auth-…`. Git ignores that file. Then build the office setup file (Part C). Devices joined with the key are tagged, so they never need signing in again.

   The key expires after 90 days. Then make a new one, replace it in `.env.office`, and build the office setup file again. PCs already set up keep working.
4. **Optional check from your phone:** install the Tailscale app, sign in with the agency account, and open `http://agency-server:8090/api/health` in the phone's browser. It should say `API is healthy`. That proves other devices can reach the server.

---

## Part C: staff PCs and laptops (about 5 minutes each)

**Before you start:** either add the employee in the app (**Organization → Add employee**) and note their email and temporary password, or let them create their own account in step 3.

**The office setup file** is one file that does everything: `F:\agency-tracker\dist\office\PSEO-Tracker-Office-Setup-<version>.exe`.
- Build it with `npm run office-setup`. It packs the newest `dist\PSEO-Tracker-Setup-<version>.exe`, the Tailscale installer and the key from `.env.office` ([build.mjs](../scripts/office-setup/build.mjs)).
- **It contains the network key: keep it private.** Pass it on only by USB stick or a private Drive folder, never by email to outsiders, and never upload it to GitHub.
- To check it on any PC without installing anything, run it with `/check`.

1. Copy the office setup file to the PC.
2. On the PC, signed in to Windows **as the employee**, run it and click **Yes** when Windows asks. A window shows the progress ([setup-staff-pc.ps1](../scripts/staff-pc/setup-staff-pc.ps1)):
   - installs Tailscale and joins the agency network. A PC whose Tailscale is signed in to another account is switched to the agency network.
   - checks that `agency-server` answers
   - installs PSEO Tracker for that Windows user and opens it

   On success the window closes itself; on an error it stays open and shows what went wrong.

**Fallback without the office file:** copy the folder `dist\staff-pc-setup` and double-click **Set up this PC.cmd**. It asks for the key when there is no `tailscale-key.txt` in the folder. Installing only `PSEO-Tracker-Setup-<version>.exe` (for example from GitHub) does **not** connect the PC. The app then shows **"Connect this PC to the agency network first"** instead of sign-in and Create an account, and tells the person to run the office setup file. A PC signed in to another Tailscale account sees "This PC is on a different network". If the server PC is off, the screen says "The server isn't answering". In every case the forms appear by themselves within a few seconds once the server can be reached.
3. The employee signs in and chooses a new password, or clicks **Create an account** on the sign-in page and fills in their name, email and a password. Then they accept the tracking notice.
4. Check the **Live Board**: during shift hours they show as Active or Idle within a minute.

**People who create their own account** are employees straight away, with no team and no salary, and they are tracked from the start. You get a bell notification, "New employee registered". Open them under **Organization → Employees** and set their team, role, designation and salary. An account you don't recognise can be deactivated there. Only devices on the agency's Tailscale can reach the sign-in page's server, and it accepts at most 5 new accounts a minute from one PC.

From then on the app starts by itself (hidden in the tray) at every Windows sign-in and records active and idle time during shift hours. Employees can't turn that off. Laptops work anywhere with internet. Without a connection they keep recording and send the time later.

**When someone leaves:** deactivate them in the app (**Organization**), and remove their PC under **Machines** in the Tailscale admin console.

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
