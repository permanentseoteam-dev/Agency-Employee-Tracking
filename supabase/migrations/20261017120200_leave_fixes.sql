-- Leave days follow the holiday calendar (audit fix, 2026-10-17).
-- A request's days are counted when it is sent and again when it is approved: its working days,
-- that is days whose ISO weekday is in Rules' work days (org_settings.work_days, 1 = Monday …
-- 7 = Sunday) and that aren't holidays; a half day counts 0.5, or 0 when that day isn't a
-- working day. The rule lives in shared/logic/leave.js (countDays); public.leave_days below is
-- the same count in SQL. Before this, adding, moving or deleting a holiday left the stored days
-- of requests already sent or approved as they were, so balances, quotas and monthly limits
-- were off. Now every holiday change recounts the pending and approved requests covering the
-- old or the new date.
--
-- Holidays are written by admins straight from the app (RLS "admins insert/update/delete"), not
-- through an Edge Function, so the recount is a trigger on the table.
--
-- Requests whose days are already wrong from earlier holiday changes are not touched here (a
-- blanket recount would also apply today's work days to old requests sent under different
-- Rules). To fix those once, after checking the list, run in the SQL editor:
--   update public.leave_requests lr set days = public.leave_days(lr.start_date, lr.end_date, lr.half_day)
--   where lr.status in ('pending', 'approved') and lr.days <> public.leave_days(lr.start_date, lr.end_date, lr.half_day);

-- ---- a request may be left with 0 days ---------------------------------------------------------
-- When every working day of a request becomes a holiday it counts 0 days, which the old check
-- (days >= 0.5) refused, so the holiday couldn't be saved. The functions still refuse sending a
-- request with no working days and approving one ("Reject the request instead").
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.leave_requests'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%days >= 0.5%'
  loop
    execute format('alter table public.leave_requests drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.leave_requests drop constraint if exists leave_requests_days_check;
alter table public.leave_requests add constraint leave_requests_days_check check (days >= 0);

-- ---- the day count (shared/logic/leave.js countDays) -------------------------------------------
create or replace function public.leave_days(first_day text, last_day text, is_half boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  with working as (
    select count(*)::numeric as n
    from (select first_day::date + i as d from generate_series(0, last_day::date - first_day::date) as i) g
    where coalesce((select s.work_days from public.org_settings s limit 1), '[]'::jsonb) @> to_jsonb(extract(isodow from g.d)::int)
      and not exists (select 1 from public.holidays h where h.date = to_char(g.d, 'YYYY-MM-DD'))
  )
  select case when is_half then (case when n > 0 then 0.5 else 0 end) else n end from working
$$;
revoke execute on function public.leave_days(text, text, boolean) from public, anon, authenticated;

-- ---- recount on every holiday change -----------------------------------------------------------
create or replace function public.recount_leave_for_holiday() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  changed text[];
  r record;
  n numeric;
begin
  if tg_op = 'INSERT' then
    changed := array[new.date];
  elsif tg_op = 'DELETE' then
    changed := array[old.date];
  elsif new.date is distinct from old.date then
    changed := array[old.date, new.date];
  else
    return null; -- only the name changed
  end if;

  for r in
    select lr.id, lr.start_date, lr.end_date, lr.half_day, lr.days
    from public.leave_requests lr
    where lr.status in ('pending', 'approved')
      and exists (select 1 from unnest(changed) as c(d) where lr.start_date <= c.d and lr.end_date >= c.d)
  loop
    begin
      n := public.leave_days(r.start_date, r.end_date, r.half_day);
      if n is distinct from r.days then
        update public.leave_requests set days = n where id = r.id;
      end if;
    exception when others then
      -- One bad row must not stop the admin saving the holiday.
      raise warning 'leave recount skipped request %: %', r.id, sqlerrm;
    end;
  end loop;
  return null;
end $$;
revoke execute on function public.recount_leave_for_holiday() from public, anon, authenticated;

drop trigger if exists recount_leave on public.holidays;
create trigger recount_leave after insert or update or delete on public.holidays
  for each row execute function public.recount_leave_for_holiday();
