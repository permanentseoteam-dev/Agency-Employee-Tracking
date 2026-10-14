# Going live: server, installer, updates and backups

This is the step-by-step for putting PSEO Tracker into use (roadmap M12). The setup chosen:

- **Server:** an always-on Windows PC in the office runs PocketBase as a Windows service.
- **Network:** staff PCs reach it over **Tailscale** (a free private network). Nothing is opened to the internet and no domain is needed.
- **Updates:** installers are published to a public, releases-only GitHub repo, `permanentseoteam-dev/pseo-tracker-releases`. Installed apps update themselves from there.
- **Backups:** PocketBase makes a backup zip every night at 02:00, and a scheduled task copies it to the **E: drive** at 03:00.

Allow about an hour for parts A and B the first time.

---

## Part A: the server PC (once)

**What it needs:** Windows 10/11 that stays on, plugged into a UPS if possible. The database goes on a non-C: drive (D: below) and backups on E:. Adjust the drive letters if yours differ.

1. **Tailscale.** Install it from tailscale.com/download and sign in with the agency's Tailscale account. In the admin console (login.tailscale.com), rename the machine to something short such as `agency-server`. Check under DNS that **MagicDNS** is on. Staff apps will reach the server at `http://agency-server:8090`.
2. **Copy the server folder.** Copy `server\` from the repo to the PC, e.g. `D:\PSEOTracker\server\`. It must contain `pocketbase.exe`, `pb_migrations\`, `pb_hooks\` and `deploy\`. Don't copy `pb_data\`, which is development test data.
3. **NSSM.** Download it from nssm.cc/download and put `win64\nssm.exe` into `D:\PSEOTracker\server\deploy\`.
4. **Install the service.** Open PowerShell **as Administrator**:
   ```powershell
   cd D:\PSEOTracker\server\deploy
   powershell -ExecutionPolicy Bypass -File .\install-service.ps1 -DataDir D:\PSEOTracker\pb_data
   ```
   This creates the service "PocketBase", which starts at boot and restarts after a crash. It also:
   - gives PocketBase 30 seconds to shut down cleanly
   - opens port 8090 to Tailscale addresses only
   - turns off sleep while the PC is on mains power
   
   The migrations run on first start, creating the collections and the default rules and leave types.
5. **Your superuser** (the dashboard login). In the same window:
   ```powershell
   ..\pocketbase.exe superuser upsert you@agency.com "a-long-password" --dir D:\PSEOTracker\pb_data
   ```
   Open `http://127.0.0.1:8090/_/` on the server PC and sign in.
6. **The first app admin.** In the dashboard, open **users**, then **New record**. Fill in email, password, full name, `role = admin` and `active = on`. Everyone else is added from the app (Organization → Add employee).
7. **Rules.** Sign in to the app as that admin and check **Rules**: shift, working days, grace, idle threshold and late penalty. Add this year's holidays under **Calendar → Holidays**.

### Backups to E:

8. Register the nightly copy (PowerShell as Administrator):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\register-backup-task.ps1 -DataDir D:\PSEOTracker\pb_data -BackupDir E:\PSEOTrackerBackups
   ```
9. Test it once by hand:
   1. In the dashboard: Settings → Backups → **Backup now**.
   2. Run `Start-ScheduledTask -TaskName "PSEO Tracker backup copy"`.
   3. Check that the zip is in `E:\PSEOTrackerBackups` and that `backup-log.txt` has a new line.
10. **Restore drill.** Do it now, then every few months:
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\restore-drill.ps1 -BackupDir E:\PSEOTrackerBackups
    ```
    It restores the newest zip into a temporary copy on port 8099, prints the record counts and deletes the copy. The live server isn't touched.

> E: protects against a failed data drive or a corrupted database, but not against theft, fire or ransomware hitting the whole PC. Now and then, copy the newest zip from E: to a USB drive or cloud storage kept elsewhere.

---

## Part B: building and publishing the installer (on the developer PC)

1. **The releases repo.** On GitHub, create an **empty public** repo, `permanentseoteam-dev/pseo-tracker-releases`. It only holds installers; the source code stays private.
2. **A token.** Create a GitHub token (Settings → Developer settings → Personal access tokens) with `repo` access to that repo. Set it in the terminal that builds:
   ```powershell
   $env:GH_TOKEN = 'ghp_…'
   ```
3. **The server address.** Copy `.env.production.example` to `.env.production` and set `VITE_PB_URL=http://agency-server:8090` (your Tailscale machine name). It's baked into the installer. The build refuses `localhost` or a raw IP.
4. **Build and publish:**
   ```powershell
   npm run release
   ```
   This builds `dist\PSEO-Tracker-Setup-<version>.exe` and creates a GitHub release with it. Check the release on GitHub. If it is a draft, publish it.
   `npm run dist` builds the same installer without publishing, for a test.

---

## Part C: installing on staff PCs

1. Install **Tailscale** and sign it into the **agency's** Tailscale account. Staff don't need their own accounts; the free plan allows up to 100 devices.
2. Run `PSEO-Tracker-Setup-<version>.exe`. The installer isn't code-signed, so Windows SmartScreen shows "Windows protected your PC" the first time. Click **More info**, then **Run anyway**. Updates don't show this.
3. The app installs for that Windows user, without admin rights, and opens. Sign in with the details from Organization → Add employee, change the password, and accept the tracking notice.
4. From then on, the app starts hidden in the tray at every Windows sign-in. For employees this can't be turned off.

---

## Part D: shipping an update

1. Raise `"version"` in `package.json`, e.g. `0.1.0` → `0.2.0`, and commit.
2. Run `npm run release` (with `GH_TOKEN` set).
3. Installed apps check every 6 hours and at start-up, and download the update quietly. It installs itself:
   - the next time nobody is being tracked on that PC (outside shift hours or with the screen locked), or
   - when the app quits.
   
   The log shows `updater: installing 0.2.0 …`.

**Server changes** (new `pb_hooks` or `pb_migrations` files) are deployed separately:
1. Copy the two folders over the ones on the server.
2. Restart the service: `nssm restart PocketBase`. New migrations apply on start.

---

## Restoring a backup for real

1. Stop the service: `nssm stop PocketBase`.
2. Rename `D:\PSEOTracker\pb_data` to `pb_data-broken` and keep it until you're sure.
3. Unzip the chosen backup from `E:\PSEOTrackerBackups` into a new, empty `D:\PSEOTracker\pb_data`.
4. Start the service: `nssm start PocketBase`, then check the app.

Anything recorded after that backup is lost: at most a day with nightly backups. The exception is time a staff PC hadn't synced yet, which the app still sends.

---

## Go-live checklist (roadmap M12 "Done when")

- [ ] The installer runs on a clean Windows 10/11 PC (SmartScreen: More info → Run anyway).
- [ ] After a reboot the app starts by itself in the tray, and the Live Board shows that person Active or Idle.
- [ ] Their tracked time appears on the production server (Reports, or the `activity_segments` collection).
- [ ] A published higher version installs itself on that PC. Hover the tray icon: the tooltip shows the version.
- [ ] A backup zip from E: has been restored with `restore-drill.ps1`.
- [ ] The manual end-to-end steps in plan.md §8 pass against the production server.
