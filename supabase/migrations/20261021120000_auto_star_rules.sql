-- Automatic star rules can be switched off (2026-10-21): an admin may delete the Late or the Short
-- rule, and those stars stop counting (the attendance function counts a kind only while its rule
-- exists); adding the rule back switches them on again. At most one rule per automatic kind, and
-- whether a rule is automatic still can't change. Safe to run again.

create unique index if not exists idx_star_rules_auto on public.star_rules (auto) where auto <> '';

create or replace function public.guard_star_rule() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.guards_off() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' and new.auto <> '' and not (public.is_trusted() or public.is_admin()) then
    perform public.reject('Only an admin can add an automatic rule back.');
  elsif tg_op = 'UPDATE' and new.auto is distinct from old.auto then
    perform public.reject('Whether a rule is automatic can’t change.');
  end if;
  return coalesce(new, old);
end $$;
