-- Each person's PocketBase account id, set by scripts/migrate-to-supabase.mjs. After the switch, a
-- PC's queued time recorded under that old id moves to the person only when it matches their own
-- profile (electron/main/engine.ts), so on a shared PC nobody gets someone else's time.
alter table public.profiles add column legacy_id text unique;

-- Like role and team, nobody changes their own old id.
create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.guards_off() or public.is_trusted() or public.is_admin() then return new; end if;
  if new.role is distinct from old.role or new.team is distinct from old.team or new.active is distinct from old.active
     or new.joined_on is distinct from old.joined_on or new.left_on is distinct from old.left_on
     or new.pending_approval is distinct from old.pending_approval or new.legacy_id is distinct from old.legacy_id then
    perform public.reject('You can’t change your own role, team, dates or account status.');
  end if;
  return new;
end $$;
