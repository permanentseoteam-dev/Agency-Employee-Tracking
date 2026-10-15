# Switch-over: PocketBase → Supabase

The evening the app moves from the office PC's PocketBase to the live Supabase project (plan step 6). About 30 minutes, plus a week of keeping PocketBase as a fallback. Keys and passwords live only in `.env.supabase` (git-ignored); nothing secret goes in this file or in chat.

## Before the evening (once)

1. **Create the live project** at supabase.com: name `pseo-live`, the same region as staging. In `.env.supabase` add, as for staging:
   `LIVE_URL`, `LIVE_ANON_KEY`, `LIVE_SERVICE_ROLE_KEY`, `LIVE_DB_PASSWORD`, `LIVE_DB_HOST` (the pooler host from *Connect*).
2. **Schema, rules and functions on live** (from `F:\agency-tracker`, on the `supabase-app` branch):
   ```
   npx supabase@2.121.0 db push --db-url <live database URL>
   node scripts/build-edge-shared.mjs
   npx supabase@2.121.0 functions deploy --project-ref <live ref>
   npx supabase@2.121.0 functions deploy register --no-verify-jwt --project-ref <live ref>
   node scripts/supabase-secrets.mjs live
   ```
   `register` goes last and on its own: "Create an account" is for people who are not signed in yet.
3. **Auth settings on live** (dashboard → Authentication):
   - Sign In / Providers → Email: turn **off** "Allow new users to sign up". Accounts come only from the app's own functions; a direct sign-up would get a switched-off account anyway.
   - Turn **off** "Confirm email" (no email service is set up).
4. **Dry run with real data on staging** (reads a copy of PocketBase; changes nothing there):
   ```
   node scripts/migrate-to-supabase.mjs --from D:\PSEOTracker\pb_data\data.db --to staging --reset
   ```
   It must end with **"Done: everything matches."** Then sign in to a staging test build with your own account and look around.
5. **Release settings:** `.env.production` gets the live `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the release check refuses anything else).

## The evening

1. Tell everyone: tracking keeps running on their PCs; the app asks them to sign in once after it updates (same password).
2. **PocketBase backup:** dashboard on the server PC → Settings → Backups → *Create backup*.
3. **Copy everything to live:**
   ```
   node scripts/migrate-to-supabase.mjs --from D:\PSEOTracker\pb_data\data.db --to live
   ```
   It refuses a live project that already has data. It must end with **"Done: everything matches."** If not, stop here: nothing has changed for anyone yet.
4. **Release 0.2.0** (only when you say so): merge `supabase-app` into `main`, version 0.2.0, `npm run release`.
5. PCs update themselves from GitHub as before. After the update each person signs in once. Time the PC recorded before that sign-in is sent to their new account, but only if it was recorded for them (their old PocketBase id is kept on their profile), so a shared PC never hands one person's time to another.

## The week after

- Leave the PocketBase service running for one week: a PC that hasn't updated yet keeps sending its tracked time there.
- Each day (and once at the end), copy what arrived:
  ```
  node scripts/migrate-to-supabase.mjs --from D:\PSEOTracker\pb_data\data.db --to live --delta
  ```
  It adds new tracked time (never twice, never over time already recorded), makes accounts for new sign-ups, and lists anything else new in PocketBase (a leave request, say) to redo by hand in the app. It is safe to run any number of times. Attendance for the last 7 days is recounted by the hourly job; for older days use Attendance → Recompute.
- After the week: stop the PocketBase service and keep `D:\PSEOTracker` as an archive. Then plan step 7 (nightly backups of live).

## If something goes wrong

- **Before step 4 of the evening**, nothing has changed for staff: PocketBase is still what every PC uses. Fix the problem, and if live already has data from a failed attempt, delete and recreate the live project (or ask for a wipe script), then run step 3 again.
- **After the release**, PocketBase is still running with all data up to the switch; `--delta` brings over what came later.
