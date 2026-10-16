-- How full the database is, for the line in an admin's Settings (the free plan allows 500 MB).
-- Anyone else gets null.
create or replace function public.database_size() returns bigint
language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then pg_database_size(current_database()) end
$$;
revoke execute on function public.database_size() from public, anon;
grant execute on function public.database_size() to authenticated;
