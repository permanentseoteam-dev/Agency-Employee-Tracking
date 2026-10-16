# Switch-over: PocketBase → Supabase

The evening the app moves from the office PC's PocketBase to the live Supabase project (plan step 6). About 30 minutes, plus a week of keeping PocketBase as a fallback. Keys and passwords live only in `.env.supabase` (git-ignored); nothing secret goes in this file or in chat.

## Before the evening (once)

1. **The demo company** (`@demo.test` accounts, teams "Demo Alpha"/"Demo Bravo") is left out by the migration by itself; nothing to remove first. It stays only in the PocketBase archive.
2. **The live project.** Decided on 2026-10-16: the existing **Sydney** project (until then "staging") is the live project. Reset it to its default rows (accounts included) while it still holds only test data. Then in `.env.supabase` rename its keys `STAGING_*` → `LIVE_*` and remove the `STAGING_*` lines. Without `STAGING_*` keys the test tools (`npm run test:env`, `npm run check:rules`, `restore … --to staging`) refuse to run, so nothing can wipe live. A new test project comes later.
   For a brand-new live project instead: create it at supabase.com and add `LIVE_URL`, `LIVE_ANON_KEY`, `LIVE_SERVICE_ROLE_KEY`, `LIVE_DB_PASSWORD`, `LIVE_DB_HOST` (the pooler host from *Connect*) the same way.
   Use the **legacy** `anon` and `service_role` keys (Project Settings → API Keys → Legacy; they start with `eyJ`), not the newer `sb_publishable` / `sb_secret` keys.
3. **Schema, rules and functions on live** (from `F:\agency-tracker`, on the `supabase-app` branch):
   ```
   npx supabase@2.121.0 db push --db-url <live database URL>
   node scripts/build-edge-shared.mjs
   npx supabase@2.121.0 functions deploy --project-ref <live ref>
   node scripts/supabase-secrets.mjs live
   ```
   `supabase/config.toml` deploys `register` without the sign-in check ("Create an account" is used before anyone is signed in). To be sure, `npx supabase@2.121.0 functions deploy register --no-verify-jwt --project-ref <live ref>` does the same.
4. **Auth settings on live** (dashboard → Authentication):
   - Sign In / Providers → Email: turn **off** "Allow new users to sign up". Accounts come only from the app's own functions.
   - Turn **off** "Confirm email" (no email service is set up).
   - Minimum password length **8** (the app's own rule).
5. **Dry run with real data on staging** (reads a copy of PocketBase; changes nothing there):
   ```
   node scripts/migrate-to-supabase.mjs --from D:\PSEOTracker\pb_data\data.db --to staging --reset
   ```
   It must end with **"Done: everything matches."** Then sign in to a staging test build with your own account and look around.
6. **Release settings:** `.env.production` gets the live `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `scripts/check-release-env.mjs` refuses anything else, including the staging project.
7. **Postgres tools for the backup** (docs/deployment.md, Part D, step 1), if this PC doesn't have them yet.

## The evening

1. Tell everyone: tracking keeps running on their PCs; the app asks them to sign in once after it updates (same password).
2. **Stop PocketBase and back it up** (PowerShell as Administrator). Staff apps keep recording and send the time later.
   ```
   Stop-Service PocketBase
   Copy-Item D:\PSEOTracker\pb_data E:\PSEOTrackerBackups\before-supabase -Recurse
   ```
3. **Copy everything to live**, while PocketBase is stopped (so nothing changes mid-copy):
   ```
   node scripts/migrate-to-supabase.mjs --from D:\PSEOTracker\pb_data\data.db --to live
   ```
   It refuses a live project that already has data. It must end with **"Done: everything matches."** If not, stop here: `Start-Service PocketBase`, and nothing has changed for anyone.
4. **Start PocketBase again** for the fallback week: `Start-Service PocketBase`. PCs that haven't updated yet keep using it.
5. **Daily backup of live** (as Administrator), then run it once and check `E:\PSEOTrackerBackups\supabase\backup.log`:
   ```
   powershell -ExecutionPolicy Bypass -File .\scripts\register-supabase-backup-task.ps1
   Start-ScheduledTask -TaskName "PSEO Tracker Supabase backup"
   ```
6. **Release 0.2.0** (only when you say so): merge `supabase-app` into `main`, version 0.2.0, `npm run release`. This publishes a **public** release at once (not a draft): every PC updates itself at its next start or within 6 hours. To hold it back, run `npm run dist` instead and upload the files to a draft release by hand.
7. Right after the release, copy what reached PocketBase since step 3 (step "The week after" explains it):
   ```
   node scripts/migrate-to-supabase.mjs --from D:\PSEOTracker\pb_data\data.db --to live --delta
   ```
8. After the update each person signs in once. Time the PC recorded before that sign-in goes to their new account, but only if it was recorded for them (their old PocketBase id is kept on their profile), so a shared PC never hands one person's time to another.

## The week after

- Leave the PocketBase service running for one week: a PC that hasn't updated yet keeps sending its tracked time there.
- The next morning, then each day, copy what arrived:
  ```
  node scripts/migrate-to-supabase.mjs --from D:\PSEOTracker\pb_data\data.db --to live --delta
  ```
  It adds new tracked time (never twice, never over time already recorded), makes accounts for sign-ups since the copy (still waiting for approval), carries over a password someone changed on an old app, and **lists** other account changes made in PocketBase (role, team, switched on or off) for you to check in Organization: it never overwrites them, because the app may hold a newer change. Accounts you deleted in Supabase are not made again. Anything else new in PocketBase (a leave request, say) is listed to redo by hand in the app. It is safe to run any number of times. Attendance for the last 7 days is recounted by the hourly job; for older days use Attendance → Recompute.
- **At the end of the week**, in this order (as Administrator):
  1. `Stop-Service PocketBase` (nothing can reach it any more)
  2. the last `--delta`, as above (it reads the stopped database)
  3. turn off the public address: `& 'C:\Program Files\Tailscale\tailscale.exe' funnel --https=443 off`
  4. keep `D:\PSEOTracker` as an archive; set the service to Manual or remove it.

## If something goes wrong

- **Before step 6 of the evening**, nothing has changed for staff: PocketBase is still what every PC uses. Fix the problem, and if live already has data from a failed attempt, delete and recreate the live project, then run the evening from step 2 again.
- **After the release**, PocketBase is still running with all data up to the switch; `--delta` brings over what came later.
