-- Live updates for the rules and teams too (the app follows org_settings to hand the tracker
-- new shift times and idle threshold at once, as it did with PocketBase subscriptions).
alter publication supabase_realtime add table public.org_settings, public.teams;
