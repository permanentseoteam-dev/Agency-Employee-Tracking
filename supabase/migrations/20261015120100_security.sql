-- Who may read and write what: the PocketBase API rules as Row Level Security.
-- PocketBase rule → helper here:
--   auth          → public.signed_in()   (an active, approved account; PocketBase refused
--                                          inactive accounts at sign-in, so the same holds)
--   admin         → public.is_admin()
--   own || staff  → "user" = auth.uid() or public.is_staff_for("user")
--   client member → public.is_member(client)
-- Writes that need business logic (leave, stars, payroll runs, accounts) go through Edge
-- Functions with the service role, which RLS doesn't apply to; there is no policy for them here.

-- ---- helpers (security definer: they read profiles/teams/clients whatever the caller sees) ----
create or replace function public.signed_in() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and not p.pending_approval)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and not p.pending_approval and p.role = 'admin')
$$;

-- Admins see everyone; a manager sees people in the teams they manage.
create or replace function public.is_staff_for(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1
    from public.profiles me
    join public.profiles p on p.id = target
    join public.teams t on t.id = p.team
    where me.id = auth.uid() and me.active and not me.pending_approval and me.role = 'manager' and t.manager = me.id
  )
$$;

create or replace function public.is_member(client_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.signed_in() and exists (
    select 1 from public.clients c where c.id = client_id and not c.archived and auth.uid() = any (c.members)
  )
$$;

-- Server-side writers (service role, migrations, SQL editor) are trusted, like PocketBase superusers.
create or replace function public.is_trusted() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.role(), 'service_role') = 'service_role'
$$;

-- ---- a profile (and email row) for every new account ------------------------------------------
create or replace function public.on_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (id) do nothing;
    insert into public.profile_emails (id, email) values (new.id, coalesce(new.email, ''))
    on conflict (id) do update set email = excluded.email;
  elsif new.email is distinct from old.email then
    update public.profile_emails set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user after insert or update of email on auth.users
  for each row execute function public.on_auth_user();

-- ---- turn on RLS everywhere ----------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'profile_emails', 'teams', 'salaries', 'org_settings', 'activity_segments',
    'presence', 'attendance', 'leave_types', 'leave_requests', 'holidays', 'events', 'payroll_runs', 'payroll_items',
    'notifications', 'star_rules', 'star_records', 'clients', 'project_events']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Tables everyone signed in reads and only admins write.
do $$
declare t text;
begin
  foreach t in array array['teams', 'leave_types', 'holidays', 'events', 'star_rules']
  loop
    execute format('create policy "signed in read" on public.%I for select to authenticated using (public.signed_in())', t);
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- ---- profiles: everyone reads; you edit your own (limited fields, see the guard trigger), admins any ----
create policy "signed in read" on public.profiles for select to authenticated
  using (public.signed_in() or id = auth.uid()); -- your own row also while waiting for approval
create policy "self or admin update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "self or admin read" on public.profile_emails for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- ---- salaries: admins; everyone else their own row, read-only ------------------------------
create policy "own or admin read" on public.salaries for select to authenticated
  using (public.is_admin() or "user" = auth.uid());
create policy "admins insert" on public.salaries for insert to authenticated with check (public.is_admin());
create policy "admins update" on public.salaries for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete" on public.salaries for delete to authenticated using (public.is_admin());

-- ---- org_settings: everyone reads, admins update (the one row is never added or deleted) -----
create policy "signed in read" on public.org_settings for select to authenticated using (public.signed_in());
create policy "admins update" on public.org_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- tracked time: own or staff read; you add your own segments; never edited --------------
create policy "own or staff read" on public.activity_segments for select to authenticated
  using ("user" = auth.uid() or public.is_staff_for("user"));
create policy "self insert" on public.activity_segments for insert to authenticated
  with check (public.signed_in() and "user" = auth.uid());

create policy "own or staff read" on public.presence for select to authenticated
  using ("user" = auth.uid() or public.is_staff_for("user"));
create policy "self insert" on public.presence for insert to authenticated
  with check (public.signed_in() and "user" = auth.uid());
create policy "self update" on public.presence for update to authenticated
  using ("user" = auth.uid()) with check ("user" = auth.uid());

create policy "own or staff read" on public.attendance for select to authenticated
  using ("user" = auth.uid() or public.is_staff_for("user"));

-- ---- leave: own or staff read; every change goes through the leave functions -----------------
create policy "own or staff read" on public.leave_requests for select to authenticated
  using ("user" = auth.uid() or public.is_staff_for("user"));

-- This year's balances per person and leave type (Karachi year), own or staff only.
create view public.leave_balances with (security_invoker = true) as
select
  p.id::text || lt.id as id,
  p.id as "user",
  lt.id as leave_type,
  lt.yearly_quota_days as quota,
  coalesce(sum(lr.days), 0)::real as used,
  (lt.yearly_quota_days - coalesce(sum(lr.days), 0))::real as remaining
from public.profiles p
cross join public.leave_types lt
left join public.leave_requests lr
  on lr."user" = p.id and lr.leave_type = lt.id and lr.status = 'approved'
  and substr(lr.start_date, 1, 4) = to_char(now() at time zone 'Asia/Karachi', 'YYYY')
where p.active and (p.id = auth.uid() or public.is_staff_for(p.id))
group by p.id, lt.id;
grant select on public.leave_balances to authenticated;

-- ---- payroll: admins; others see finalized runs and their own lines in them ---------------
create policy "admin or finalized read" on public.payroll_runs for select to authenticated
  using (public.is_admin() or (public.signed_in() and status = 'finalized'));
create policy "admins insert" on public.payroll_runs for insert to authenticated with check (public.is_admin());
create policy "admins update" on public.payroll_runs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete" on public.payroll_runs for delete to authenticated using (public.is_admin());

create policy "admin or own finalized read" on public.payroll_items for select to authenticated
  using (public.is_admin() or ("user" = auth.uid()
    and exists (select 1 from public.payroll_runs r where r.id = run and r.status = 'finalized')));
create policy "admins insert" on public.payroll_items for insert to authenticated with check (public.is_admin());
create policy "admins update" on public.payroll_items for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete" on public.payroll_items for delete to authenticated using (public.is_admin());

-- ---- notifications: your own; you may mark them read (guard trigger) and delete them ---------
create policy "own read" on public.notifications for select to authenticated using ("user" = auth.uid());
create policy "own update" on public.notifications for update to authenticated using ("user" = auth.uid()) with check ("user" = auth.uid());
create policy "own delete" on public.notifications for delete to authenticated using ("user" = auth.uid());

-- ---- stars: rules are above (everyone reads, admins write); records own or staff read --------
create policy "own or staff read" on public.star_records for select to authenticated
  using ("user" = auth.uid() or public.is_staff_for("user"));
create policy "admins delete" on public.star_records for delete to authenticated using (public.is_admin());

-- ---- projects: admins everything; members see their (not archived) clients and edit their calendars ----
create policy "admin or member read" on public.clients for select to authenticated
  using (public.is_admin() or public.is_member(id));
create policy "admins insert" on public.clients for insert to authenticated with check (public.is_admin());
create policy "admins update" on public.clients for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete" on public.clients for delete to authenticated using (public.is_admin());

create policy "admin or member read" on public.project_events for select to authenticated
  using (public.is_admin() or public.is_member(client));
create policy "admin or member insert" on public.project_events for insert to authenticated
  with check (public.is_admin() or public.is_member(client));
create policy "admin or member update" on public.project_events for update to authenticated
  using (public.is_admin() or public.is_member(client)) with check (public.is_admin() or public.is_member(client));
create policy "admin or member delete" on public.project_events for delete to authenticated
  using (public.is_admin() or public.is_member(client));

-- ---- avatars: public pictures; each person manages the files in their own folder ----------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
create policy "own avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---- live updates (Realtime) for the tables the app subscribes to ------------------------------
alter publication supabase_realtime add table
  public.profiles, public.presence, public.leave_requests, public.notifications, public.clients, public.project_events,
  public.activity_segments, public.star_records;
