-- Switched off means out at once (PocketBase refreshTokenKey): deactivating someone or resetting
-- their password ends their sessions, and a Supabase access token whose session is gone must stop
-- working immediately, not when it expires an hour later. Every rule now goes through my_id():
-- the caller's id only while their session exists and their account is active and approved.

create or replace function public.session_uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select auth.uid()
  where exists (select 1 from auth.sessions s where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid)
$$;

create or replace function public.my_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p where p.id = public.session_uid() and p.active and not p.pending_approval
$$;

create or replace function public.signed_in() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_id() is not null
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = public.my_id() and p.role = 'admin')
$$;

create or replace function public.is_staff_for(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.profiles me
    join public.profiles p on p.id = target
    join public.teams t on t.id = p.team
    where me.id = public.my_id() and me.role = 'manager' and t.manager = me.id
  )
$$;

create or replace function public.is_member(client_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clients c where c.id = client_id and not c.archived and public.my_id() = any (c.members))
$$;

-- The "own" policies used auth.uid() directly; they now need a live session too.
drop policy "signed in read" on public.profiles;
create policy "signed in read" on public.profiles for select to authenticated
  using (public.signed_in() or id = public.session_uid());
drop policy "self or admin update" on public.profiles;
create policy "self or admin update" on public.profiles for update to authenticated
  using (id = public.my_id() or public.is_admin()) with check (id = public.my_id() or public.is_admin());
drop policy "self or admin read" on public.profile_emails;
create policy "self or admin read" on public.profile_emails for select to authenticated
  using (id = public.session_uid() or public.is_admin());

drop policy "own or admin read" on public.salaries;
create policy "own or admin read" on public.salaries for select to authenticated using (public.is_admin() or "user" = public.my_id());

do $$
declare t text;
begin
  foreach t in array array['activity_segments', 'presence', 'attendance', 'leave_requests', 'star_records']
  loop
    execute format('drop policy "own or staff read" on public.%I', t);
    execute format('create policy "own or staff read" on public.%I for select to authenticated using ("user" = public.my_id() or public.is_staff_for("user"))', t);
  end loop;
end $$;

drop policy "self insert" on public.activity_segments;
create policy "self insert" on public.activity_segments for insert to authenticated with check ("user" = public.my_id());
drop policy "self insert" on public.presence;
create policy "self insert" on public.presence for insert to authenticated with check ("user" = public.my_id());
drop policy "self update" on public.presence;
create policy "self update" on public.presence for update to authenticated using ("user" = public.my_id()) with check ("user" = public.my_id());

drop policy "admin or own finalized read" on public.payroll_items;
create policy "admin or own finalized read" on public.payroll_items for select to authenticated
  using (public.is_admin() or ("user" = public.my_id()
    and exists (select 1 from public.payroll_runs r where r.id = run and r.status = 'finalized')));

drop policy "own read" on public.notifications;
create policy "own read" on public.notifications for select to authenticated using ("user" = public.my_id());
drop policy "own update" on public.notifications;
create policy "own update" on public.notifications for update to authenticated using ("user" = public.my_id()) with check ("user" = public.my_id());
drop policy "own delete" on public.notifications;
create policy "own delete" on public.notifications for delete to authenticated using ("user" = public.my_id());

create or replace view public.leave_balances with (security_invoker = true) as
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
where p.active and (p.id = public.my_id() or public.is_staff_for(p.id))
group by p.id, lt.id;
