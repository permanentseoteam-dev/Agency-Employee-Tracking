-- Every hour at :05 the attendance function recounts the 7 days just finished (was cronAdd in
-- attendance.pb.js). The project URL and service key come from Vault, filled in once per project
-- by scripts/supabase-secrets.mjs, so no key is stored in this repo.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'attendance-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/attendance-recompute',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"nightly": true}'::jsonb,
    timeout_milliseconds := 60000
  )
  $$
);
