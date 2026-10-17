-- Stars cost money (2026-10-17): every star rule has its own price in rupees per star, set and
-- changed by admins in Rules → Stars. Payroll deducts, per person and month, the sum of
-- (stars × that rule's price) over the counted (not excused) rule breaks. Safe to run again.

alter table public.star_rules
  add column if not exists pkr_per_star numeric not null default 0;
alter table public.star_rules drop constraint if exists star_rules_pkr_per_star_check;
alter table public.star_rules
  add constraint star_rules_pkr_per_star_check check (pkr_per_star >= 0 and pkr_per_star <= 1000000 and pkr_per_star = round(pkr_per_star));

-- What the payroll function counted: the stars and what they cost (already inside deductions).
alter table public.payroll_items
  add column if not exists stars integer not null default 0,
  add column if not exists stars_pkr numeric not null default 0;

-- Admins may still only set the adjustment and note: the star figures are recounted by payroll.
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
    if not public.is_trusted() and (new.base, new.working_days, new.absent_days, new.unpaid_leave_days, new.half_days, new.deductions, new.stars, new.stars_pkr)
       is distinct from (old.base, old.working_days, old.absent_days, old.unpaid_leave_days, old.half_days, old.deductions, old.stars, old.stars_pkr) then
      perform public.reject('Only the adjustment and note can be changed. Run payroll again to recount the month.');
    end if;
    if new.adjustment_pkr <> round(new.adjustment_pkr) then perform public.reject('Enter the adjustment in whole rupees.'); end if;
    new.net := new.base - new.deductions + new.adjustment_pkr;
  end if;
  return coalesce(new, old);
end $$;
