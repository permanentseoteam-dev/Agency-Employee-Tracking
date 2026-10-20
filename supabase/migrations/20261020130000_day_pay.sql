-- Day pay (2026-10-20): a month pays the sum of its working days plus the adjustment, and stars
-- cost pay again. A working day pays the daily rate (monthly salary ÷ the month's working days)
-- less its stars at the star value, never below 0. Attendance gives the stars itself: 1 per
-- started block (30 minutes) late after shift start + grace, and 1 per started block short of the
-- daily target (6 hours active). An absent day gives no stars: it pays nothing instead. Admins
-- still give stars by hand. The rules are in shared/logic (attendance.js statusFor, payroll.js
-- calculateMonth); this adds the settings and figures they read and write. Safe to run again.

-- ---- org_settings: the daily target, the star block and what a star costs ----------------------
--   required_daily_minutes  active minutes a working day needs (6 hours); less gives short stars
--   star_block_minutes      1 star per started block of this many minutes late or short
--   star_value_mode         what a star costs: one block's pay ('half_hour_pay', half an hour at
--                           30 minutes) or star_value_pkr rupees ('fixed_pkr')
-- full_day_min_hours and half_day_min_hours are no longer read; they stay because the 0.2.5 app
-- still saves them.
alter table public.org_settings
  add column if not exists required_daily_minutes integer not null default 360,
  add column if not exists star_block_minutes integer not null default 30,
  add column if not exists star_value_mode text not null default 'half_hour_pay',
  add column if not exists star_value_pkr numeric not null default 0;
alter table public.org_settings
  drop constraint if exists org_settings_required_daily_minutes_check,
  drop constraint if exists org_settings_star_block_minutes_check,
  drop constraint if exists org_settings_star_value_mode_check,
  drop constraint if exists org_settings_star_value_pkr_check;
alter table public.org_settings
  add constraint org_settings_required_daily_minutes_check check (required_daily_minutes between 1 and 1440),
  add constraint org_settings_star_block_minutes_check check (star_block_minutes between 1 and 240),
  add constraint org_settings_star_value_mode_check check (star_value_mode in ('half_hour_pay', 'fixed_pkr')),
  add constraint org_settings_star_value_pkr_check check (star_value_pkr between 0 and 1000000);

-- ---- attendance: each day's stars and the share of the daily rate it pays ----------------------
-- Written by the attendance function (attendance.js statusFor): the minutes and stars late and
-- short, and total_stars, what the day counts: late_stars and shortfall_stars unless an admin
-- excused them that day, plus the stars given by hand for it. pay_basis: 'full', 'half' (an unpaid
-- half day), 'none' (absent or unpaid leave) or 'off' (a weekend or holiday). Days counted before
-- this read 0 stars and 'full' until they are counted again (the hourly job recounts the last 7
-- days, a payroll run its month); 'half_day' stays a valid status for them.
alter table public.attendance
  add column if not exists late_minutes integer not null default 0,
  add column if not exists late_stars integer not null default 0,
  add column if not exists shortfall_minutes integer not null default 0,
  add column if not exists shortfall_stars integer not null default 0,
  add column if not exists total_stars integer not null default 0,
  add column if not exists pay_basis text not null default 'full';
alter table public.attendance
  drop constraint if exists attendance_late_minutes_check,
  drop constraint if exists attendance_late_stars_check,
  drop constraint if exists attendance_shortfall_minutes_check,
  drop constraint if exists attendance_shortfall_stars_check,
  drop constraint if exists attendance_total_stars_check,
  drop constraint if exists attendance_pay_basis_check;
alter table public.attendance
  add constraint attendance_late_minutes_check check (late_minutes >= 0),
  add constraint attendance_late_stars_check check (late_stars >= 0),
  add constraint attendance_shortfall_minutes_check check (shortfall_minutes >= 0),
  add constraint attendance_shortfall_stars_check check (shortfall_stars >= 0),
  add constraint attendance_total_stars_check check (total_stars >= 0),
  add constraint attendance_pay_basis_check check (pay_basis in ('full', 'half', 'none', 'off'));

-- Days counted before this all read 'full': give them the share their status already says, so an
-- old absent day or unpaid leave doesn't read as paid on the screens (a recount does the same).
update public.attendance
set pay_basis = case status when 'absent' then 'none' when 'half_day' then 'half' else 'off' end
where pay_basis = 'full' and status in ('absent', 'half_day', 'holiday', 'weekend');
update public.attendance a
set pay_basis = 'none'
where a.pay_basis = 'full' and a.status = 'on_leave' and exists (
  select 1 from public.leave_requests lr join public.leave_types lt on lt.id = lr.leave_type
  where lr."user" = a."user" and lr.status = 'approved' and not lt.paid and not lr.half_day
    and lr.start_date <= a.date and lr.end_date >= a.date
);

-- ---- payroll_items: the figures behind each line ------------------------------------------------
-- base is the monthly salary, gross_pkr the sum of the day pay, deductions base − gross_pkr and
-- net gross_pkr + adjustment. stars is the month's total (late + short + by hand) and
-- star_deduction_pkr what they took off; new runs write 0 half days. Lines counted before keep
-- their figures, with 0 in the new columns.
alter table public.payroll_items
  add column if not exists daily_rate numeric not null default 0,
  add column if not exists hourly_rate numeric not null default 0,
  add column if not exists star_value numeric not null default 0,
  add column if not exists star_deduction_pkr numeric not null default 0,
  add column if not exists gross_pkr numeric not null default 0,
  add column if not exists late_stars integer not null default 0,
  add column if not exists shortfall_stars integer not null default 0,
  add column if not exists hand_stars integer not null default 0;

-- Admins may still only set the adjustment and note: the new figures are recounted by payroll too.
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
    if not public.is_trusted() and (new.base, new.working_days, new.absent_days, new.unpaid_leave_days, new.half_days, new.deductions, new.stars,
         new.daily_rate, new.hourly_rate, new.star_value, new.star_deduction_pkr, new.gross_pkr, new.late_stars, new.shortfall_stars, new.hand_stars)
       is distinct from (old.base, old.working_days, old.absent_days, old.unpaid_leave_days, old.half_days, old.deductions, old.stars,
         old.daily_rate, old.hourly_rate, old.star_value, old.star_deduction_pkr, old.gross_pkr, old.late_stars, old.shortfall_stars, old.hand_stars) then
      perform public.reject('Only the adjustment and note can be changed. Run payroll again to recount the month.');
    end if;
    if new.adjustment_pkr <> round(new.adjustment_pkr) then perform public.reject('Enter the adjustment in whole rupees.'); end if;
    new.net := new.base - new.deductions + new.adjustment_pkr;
  end if;
  return coalesce(new, old);
end $$;

-- ---- star_rules: the automatic rules follow the new counting -----------------------------------
-- 'Short hours' (auto 'half_day') becomes the short-of-the-target rule, auto 'short'; days already
-- excused for it stay excused. The 'absent' rule goes, and with it its records (the days excused
-- for it): an absent day gives no stars. An automatic rule's stars column is no longer read (the
-- attendance function counts them); by-hand rules keep their stars per break.
-- guard_star_rule refuses changing auto or deleting an automatic rule, so the guards are off for
-- this part only. set_config(..., false) lasts for the session, so it holds whether or not this
-- file runs as one transaction; it is cleared again at the end.
select set_config('app.bypass_guards', 'on', false);

alter table public.star_rules drop constraint if exists star_rules_auto_check;

-- Rule names are unique: the new name only when no other rule has it already.
update public.star_rules r
set auto = 'short',
  name = case when exists (select 1 from public.star_rules o where o.name = 'Short of the daily target' and o.id <> r.id)
    then r.name else 'Short of the daily target' end,
  description = 'Active for less than the daily target: 1 star per started block short.'
where r.auto = 'half_day';

update public.star_rules
set description = 'First activity after shift start + grace: 1 star per started block late.'
where auto = 'late';

delete from public.star_rules where auto = 'absent';

-- '' = given by hand.
alter table public.star_rules
  add constraint star_rules_auto_check check (auto in ('', 'late', 'short'));

select set_config('app.bypass_guards', '', false);

-- The app's API reads columns from a cached copy of the schema: refresh it now.
notify pgrst, 'reload schema';
