-- Sign-up attempts per visitor address, for the register function's limit of 5 a minute
-- (was PocketBase's rate limit from migration 1792000000). Only server functions use it:
-- RLS is on with no policies, so apps can't read or write it.
create table public.register_attempts (
  ip text not null,
  at timestamptz not null default now()
);
create index idx_register_attempts_ip_at on public.register_attempts (ip, at);
alter table public.register_attempts enable row level security;
