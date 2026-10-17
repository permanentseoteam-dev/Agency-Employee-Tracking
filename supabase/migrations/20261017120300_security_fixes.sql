-- Security fixes from the 2026-10-17 audit (server side):
--   1. Team events: only the people of that team (and its manager, and admins) can read them.
--   2. Payroll: a draft counted mid-month can't be finalized; recount after the month ends.
--   3. Tracked time: no segments for a finalized payroll month, and at most 7 days late.
--   4. "Must change password": cleared by changing the password, never by editing the profile.
-- Safe to run again: functions are replaced, policies and triggers dropped first.

-- ---- 1. calendar events: company-wide for everyone, a team's only for that team ---------------
-- Before, every signed-in person could read every team's events through the API (only the app
-- hid them). Matches the Calendar screen: your own team, the teams you manage, or all (admins).
create or replace function public.sees_team(team_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select team_id is null
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = public.my_id() and p.team = team_id)
    or exists (
      select 1 from public.teams t join public.profiles me on me.id = t.manager
      where t.id = team_id and me.id = public.my_id() and me.role = 'manager'
    )
$$;

drop policy if exists "signed in read" on public.events;
drop policy if exists "own team read" on public.events;
create policy "own team read" on public.events for select to authenticated
  using (public.signed_in() and public.sees_team(team));
-- (insert, update and delete stay admins only, from 20261015120100_security.sql)

-- ---- 2. payroll: finalize only a full month, counted after it ended ----------------------------
-- The payroll function records the last day it counted; only it (the service role) sets it.
alter table public.payroll_runs
  add column if not exists counted_to text check (counted_to is null or counted_to ~ '^\d{4}-\d{2}-\d{2}$');

create or replace function public.guard_payroll_run() returns trigger
language plpgsql set search_path = '' as $$
declare
  first_day date;
  last_day text;
  today text;
  label text;
begin
  if public.guards_off() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then perform public.reject('A payroll run starts as a draft.'); end if;
    if not public.is_trusted() then new.counted_to := null; end if; -- nothing is counted yet
    return new;
  end if;
  if old.status = 'finalized' then
    perform public.reject(format('Payroll for %s is finalized and can’t be %s.', old.month, case when tg_op = 'DELETE' then 'deleted' else 'changed' end));
  end if;
  if tg_op = 'UPDATE' then
    if new.month is distinct from old.month then perform public.reject('A payroll run’s month can’t change.'); end if;
    if not public.is_trusted() and new.counted_to is distinct from old.counted_to then
      perform public.reject('Only a recount records how far the month is counted.');
    end if;
    -- Server scripts (test data, imports) may finalize directly; people in the app recount first.
    if new.status = 'finalized' and not public.is_trusted() then
      first_day := to_date(new.month || '-01', 'YYYY-MM-DD');
      last_day := to_char(first_day + interval '1 month' - interval '1 day', 'YYYY-MM-DD');
      label := to_char(first_day, 'FMMonth YYYY');
      today := to_char(now() at time zone coalesce((select o.timezone from public.org_settings o order by o.created limit 1), 'Asia/Karachi'), 'YYYY-MM-DD');
      if today <= last_day then
        perform public.reject(format('%s hasn’t ended yet. Recount after the month ends, then finalize.', label));
      end if;
      if new.counted_to is null or new.counted_to < last_day then
        perform public.reject(format('This draft was counted before %s ended. Recount after the month ends, then finalize.', label));
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
-- (trigger guard_payroll_run from 20261015120200_guards.sql calls this function)

-- ---- 3. tracked time: nothing for a finalized month, at most 7 days late ----------------------
-- The tracker syncs within seconds, or within hours after being offline; 7 days also matches the
-- hourly attendance recount, which never looks further back. A finalized month's pay is fixed, so
-- its time can't change any more. Trusted writers (imports, demo data) still may.
create or replace function public.guard_segment() returns trigger
language plpgsql set search_path = '' as $$
declare
  now_ts timestamptz := now();
  tz text;
begin
  if exists (select 1 from public.activity_segments s where s.id = new.id) then return new; end if;
  if public.guards_off() or public.is_trusted() then return new; end if; -- imports and demo data may be older
  if new.ended_at <= new.started_at then perform public.reject('The segment must end after it starts.', 'segment_rejected'); end if;
  if new.ended_at - new.started_at > interval '6 minutes' then perform public.reject('The segment is longer than 6 minutes.', 'segment_rejected'); end if;
  if new.ended_at > now_ts + interval '2 minutes' then perform public.reject('The segment ends in the future (check the PC clock).', 'segment_rejected'); end if;
  if now_ts - new.started_at > interval '7 days' then perform public.reject('The segment is more than 7 days old.', 'segment_rejected'); end if;
  tz := coalesce((select o.timezone from public.org_settings o order by o.created limit 1), 'Asia/Karachi');
  if exists (select 1 from public.payroll_runs r
             where r.status = 'finalized'
               and r.month in (to_char(new.started_at at time zone tz, 'YYYY-MM'), to_char(new.ended_at at time zone tz, 'YYYY-MM'))) then
    perform public.reject('Payroll for that month is finalized, so its time can’t change.', 'segment_rejected');
  end if;
  if exists (select 1 from public.activity_segments s
             where s."user" = new."user" and s.started_at < new.ended_at and s.ended_at > new.started_at) then
    perform public.reject('The segment overlaps time already recorded (is the tracker running on two PCs?).', 'segment_rejected');
  end if;
  return new;
end $$;
-- (trigger guard_segment from 20261015120200_guards.sql calls this function)

-- ---- 4. "must change password": cleared by a password change only ------------------------------
-- Before, the app changed the password and then cleared the flag itself, so anyone could clear it
-- through the API without changing the temporary password. Now saving a new password clears it
-- here, and nobody but an admin (or a server function) may change it on a profile.

-- The bcrypt cost of a stored password hash ('10' for "$2a$10$..."), or null for anything else.
create or replace function public.bcrypt_cost(hash text) returns text
language sql immutable set search_path = '' as $$
  select substring(hash from '^\$2[aby]?\$([0-9]{2})\$')
$$;
revoke execute on function public.bcrypt_cost(text) from public, anon, authenticated;

create or replace function public.on_auth_password() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was text := coalesce(current_setting('app.bypass_guards', true), '');
begin
  if new.encrypted_password is not distinct from old.encrypted_password then return new; end if;
  -- Signing in with a hash made at another cost (the passwords carried over from PocketBase) makes
  -- Supabase Auth hash the same password again at its own cost: that isn't a new password.
  if public.bcrypt_cost(old.encrypted_password) is distinct from public.bcrypt_cost(new.encrypted_password) then return new; end if;
  perform set_config('app.bypass_guards', 'on', true);
  update public.profiles set must_change_password = false where id = new.id and must_change_password;
  perform set_config('app.bypass_guards', was, true);
  return new;
end $$;
revoke execute on function public.on_auth_password() from public, anon, authenticated;
drop trigger if exists on_auth_password on auth.users;
create trigger on_auth_password after update of encrypted_password on auth.users
  for each row execute function public.on_auth_password();
-- An admin's password reset sets a new temporary password first and the flag after it
-- (org: reset-password), so the reset still ends with the flag on.

-- On your own account you may not change role, team, dates, status or the password flag.
create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.guards_off() or public.is_trusted() or public.is_admin() then return new; end if;
  if new.role is distinct from old.role or new.team is distinct from old.team or new.active is distinct from old.active
     or new.joined_on is distinct from old.joined_on or new.left_on is distinct from old.left_on
     or new.pending_approval is distinct from old.pending_approval or new.legacy_id is distinct from old.legacy_id then
    perform public.reject('You can’t change your own role, team, dates or account status.');
  end if;
  if new.must_change_password is distinct from old.must_change_password then
    perform public.reject('Choose a new password to continue. Saving it is what clears this.');
  end if;
  return new;
end $$;
