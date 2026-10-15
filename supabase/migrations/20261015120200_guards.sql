-- Guards that PocketBase hooks enforced on every request, as triggers, so they hold for every
-- client. Server functions (service role) are trusted the way PocketBase's own app-level
-- writes were; the one-off data migration can switch the guards off for its session only:
--   set local app.bypass_guards = 'on';

create or replace function public.guards_off() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.bypass_guards', true), '') = 'on'
$$;

create or replace function public.reject(message text, kind text default 'rejected') returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = message, hint = kind;
end $$;

-- ---- profiles: on your own account you may not change role, team, dates or status --------------
create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.guards_off() or public.is_trusted() or public.is_admin() then return new; end if;
  if new.role is distinct from old.role or new.team is distinct from old.team or new.active is distinct from old.active
     or new.joined_on is distinct from old.joined_on or new.left_on is distinct from old.left_on
     or new.pending_approval is distinct from old.pending_approval then
    perform public.reject('You can’t change your own role, team, dates or account status.');
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- ---- tracked time (segments.pb.js / lib/segments.js) -----------------------------------------
-- A retried sync of a stored segment fails as a duplicate id (the tracker counts that as synced).
-- Rejections carry hint 'segment_rejected' so the tracker drops the segment instead of retrying.
create or replace function public.guard_segment() returns trigger
language plpgsql set search_path = '' as $$
declare
  now_ts timestamptz := now();
begin
  if exists (select 1 from public.activity_segments s where s.id = new.id) then return new; end if;
  if public.guards_off() or public.is_trusted() then return new; end if; -- imports and demo data may be older
  if new.ended_at <= new.started_at then perform public.reject('The segment must end after it starts.', 'segment_rejected'); end if;
  if new.ended_at - new.started_at > interval '6 minutes' then perform public.reject('The segment is longer than 6 minutes.', 'segment_rejected'); end if;
  if new.ended_at > now_ts + interval '2 minutes' then perform public.reject('The segment ends in the future (check the PC clock).', 'segment_rejected'); end if;
  if now_ts - new.started_at > interval '30 days' then perform public.reject('The segment is more than 30 days old.', 'segment_rejected'); end if;
  if exists (select 1 from public.activity_segments s
             where s."user" = new."user" and s.started_at < new.ended_at and s.ended_at > new.started_at) then
    perform public.reject('The segment overlaps time already recorded (is the tracker running on two PCs?).', 'segment_rejected');
  end if;
  return new;
end $$;
create trigger guard_segment before insert on public.activity_segments for each row execute function public.guard_segment();

-- ---- calendar events and project events: end after start (events.pb.js, projects.pb.js) ----------
create or replace function public.guard_event_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not (new.ends_at > new.starts_at) then perform public.reject('The event must end after it starts.'); end if;
  return new;
end $$;
create trigger guard_event_times before insert or update on public.events for each row execute function public.guard_event_times();

create or replace function public.guard_project_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not (new.ends_at > new.starts_at) then perform public.reject('An event has to end after it starts.'); end if;
  if tg_op = 'INSERT' then
    if not public.guards_off() then new.created_by := auth.uid(); end if; -- who added it, as the server sees it
  else
    if new.client is distinct from old.client then perform public.reject('An event can’t move to another client.'); end if;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
create trigger guard_project_event before insert or update on public.project_events for each row execute function public.guard_project_event();

-- ---- payroll (payroll.pb.js): a run starts as a draft; finalized runs and their lines are locked ----
create or replace function public.guard_payroll_run() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.guards_off() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then perform public.reject('A payroll run starts as a draft.'); end if;
    return new;
  end if;
  if old.status = 'finalized' then
    perform public.reject(format('Payroll for %s is finalized and can’t be %s.', old.month, case when tg_op = 'DELETE' then 'deleted' else 'changed' end));
  end if;
  if tg_op = 'UPDATE' and new.month is distinct from old.month then perform public.reject('A payroll run’s month can’t change.'); end if;
  return coalesce(new, old);
end $$;
create trigger guard_payroll_run before insert or update or delete on public.payroll_runs
  for each row execute function public.guard_payroll_run();

create or replace function public.guard_payroll_item() returns trigger
language plpgsql set search_path = '' as $$
declare
  run_status text;
begin
  if public.guards_off() then return coalesce(new, old); end if;
  select r.status into run_status from public.payroll_runs r where r.id = coalesce(new.run, old.run);
  if run_status = 'finalized' then perform public.reject('This payroll run is finalized and can’t be changed.'); end if;
  if tg_op = 'UPDATE' then
    if new.run is distinct from old.run or new."user" is distinct from old."user" then
      perform public.reject('Only the adjustment and note can be changed.');
    end if;
    -- Admins may only set the adjustment and note; the payroll function recounts the rest.
    if not public.is_trusted() and (new.base, new.working_days, new.absent_days, new.unpaid_leave_days, new.half_days, new.deductions)
       is distinct from (old.base, old.working_days, old.absent_days, old.unpaid_leave_days, old.half_days, old.deductions) then
      perform public.reject('Only the adjustment and note can be changed. Run payroll again to recount the month.');
    end if;
    if new.adjustment_pkr <> round(new.adjustment_pkr) then perform public.reject('Enter the adjustment in whole rupees.'); end if;
    new.net := new.base - new.deductions + new.adjustment_pkr;
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_payroll_item before insert or update or delete on public.payroll_items
  for each row execute function public.guard_payroll_item();

-- ---- star rules (stars.pb.js): the automatic ones come from the migration and stay -----------------
create or replace function public.guard_star_rule() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.guards_off() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' and new.auto <> '' and not public.is_trusted() then
    perform public.reject('New rules are given by hand. The automatic ones already exist.');
  elsif tg_op = 'UPDATE' and new.auto is distinct from old.auto then
    perform public.reject('Whether a rule is automatic can’t change.');
  elsif tg_op = 'DELETE' and old.auto <> '' then
    perform public.reject('An automatic rule can’t be deleted. Set its stars to 0 to stop it.');
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_star_rule before insert or update or delete on public.star_rules
  for each row execute function public.guard_star_rule();

-- ---- notifications: the owner may only mark them read (migration 1791960000) ----------------------
create or replace function public.guard_notification() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.guards_off() or public.is_trusted() then return new; end if;
  if new."user" is distinct from old."user" or new.type is distinct from old.type or new.payload is distinct from old.payload then
    perform public.reject('A notification can only be marked as read.');
  end if;
  return new;
end $$;
create trigger guard_notification before update on public.notifications for each row execute function public.guard_notification();
