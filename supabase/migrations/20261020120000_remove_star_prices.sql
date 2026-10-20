-- Stars no longer cost money (2026-10-20): the per-rule price from 20261017120400_star_prices.sql is
-- removed. Stars are a count again; payroll deducts only absent, unpaid-leave and half days.
-- payroll_items.stars (the month's count) stays. A run that already charged stars keeps its
-- deductions; the screens show that part as "Other". Safe to run again.

-- The guard first: it must stop naming payroll_items.stars_pkr before the column goes.
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
    if not public.is_trusted() and (new.base, new.working_days, new.absent_days, new.unpaid_leave_days, new.half_days, new.deductions, new.stars)
       is distinct from (old.base, old.working_days, old.absent_days, old.unpaid_leave_days, old.half_days, old.deductions, old.stars) then
      perform public.reject('Only the adjustment and note can be changed. Run payroll again to recount the month.');
    end if;
    if new.adjustment_pkr <> round(new.adjustment_pkr) then perform public.reject('Enter the adjustment in whole rupees.'); end if;
    new.net := new.base - new.deductions + new.adjustment_pkr;
  end if;
  return coalesce(new, old);
end $$;

alter table public.star_rules drop constraint if exists star_rules_price_pkr_check;
alter table public.star_rules drop column if exists price_pkr;
alter table public.payroll_items drop column if exists stars_pkr;

-- The app's API reads columns from a cached copy of the schema: refresh it now.
notify pgrst, 'reload schema';
