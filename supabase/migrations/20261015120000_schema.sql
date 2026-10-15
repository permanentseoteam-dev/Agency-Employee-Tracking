-- PSEO Tracker on Supabase: tables, view, indexes and default rows.
-- Ported from server/pb_migrations (PocketBase). Field names are kept, so the app's
-- data shape doesn't change: "user" (quoted: a reserved word), created/updated, and
-- 15-character text ids. Accounts are Supabase Auth users; their app fields live in
-- public.profiles (id = auth.users.id). Dates without a time are "YYYY-MM-DD" text
-- in the org timezone; instants are timestamptz.

create extension if not exists pgcrypto;

-- A PocketBase-style id: 15 lowercase letters/digits.
create or replace function public.new_id() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', 1 + (get_byte(b, i) % 36), 1), '')
  from (select extensions.gen_random_bytes(15) as b) r, generate_series(0, 14) as i
$$;

-- Keeps "updated" current on every change.
create or replace function public.touch_updated() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated := now();
  return new;
end $$;

-- ---- profiles (the app fields of each account) -----------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 255),
  avatar text not null default '', -- file name in the "avatars" storage bucket, '' = none
  designation text not null default '' check (char_length(designation) <= 100),
  phone text not null default '' check (char_length(phone) <= 30),
  team text, -- references teams (added below)
  role text not null default 'employee' check (role in ('admin', 'manager', 'employee')),
  joined_on text not null default '' check (joined_on = '' or joined_on ~ '^\d{4}-\d{2}-\d{2}$'),
  left_on text not null default '' check (left_on = '' or left_on ~ '^\d{4}-\d{2}-\d{2}$'),
  active boolean not null default false,
  must_change_password boolean not null default false,
  tracking_consent_at timestamptz,
  pending_approval boolean not null default false,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- Email addresses: visible to the person and admins only (an RLS policy can't hide one
-- column, so they live apart). Kept in step with auth.users by a trigger.
create table public.profile_emails (
  id uuid primary key references public.profiles (id) on delete cascade,
  email text not null default ''
);

-- ---- teams ---------------------------------------------------------------------
create table public.teams (
  id text primary key default public.new_id(),
  name text not null check (char_length(name) between 1 and 100),
  manager uuid references public.profiles (id) on delete set null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_teams_name on public.teams (name);
alter table public.profiles
  add constraint profiles_team_fkey foreign key (team) references public.teams (id) on delete set null;

-- ---- salaries --------------------------------------------------------------------
create table public.salaries (
  id text primary key default public.new_id(),
  "user" uuid not null references public.profiles (id) on delete cascade,
  monthly_salary_pkr integer not null default 0 check (monthly_salary_pkr >= 0), -- 0 = not set yet
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_salaries_user on public.salaries ("user");

-- ---- org_settings (one row) --------------------------------------------------------
create table public.org_settings (
  id text primary key default public.new_id(),
  shift_start text not null check (shift_start ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  shift_end text not null check (shift_end ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  work_days jsonb not null,
  grace_minutes integer not null default 0 check (grace_minutes >= 0),
  full_day_min_hours numeric not null check (full_day_min_hours >= 0),
  half_day_min_hours numeric not null check (half_day_min_hours >= 0),
  idle_threshold_minutes integer not null check (idle_threshold_minutes >= 1),
  timezone text not null,
  monthly_full_leaves integer not null default 0 check (monthly_full_leaves >= 0), -- 0 = no limit
  monthly_half_leaves integer not null default 0 check (monthly_half_leaves >= 0),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

-- ---- activity_segments (ids made by the tracker; never edited) ----------------------
create table public.activity_segments (
  id text primary key,
  "user" uuid not null references public.profiles (id) on delete cascade,
  state text not null check (state in ('active', 'idle')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index idx_segments_user_start on public.activity_segments ("user", started_at);

-- ---- presence (one row per person) -------------------------------------------------
create table public.presence (
  id text primary key default public.new_id(),
  "user" uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('active', 'idle', 'offline')),
  last_seen timestamptz,
  today_active_s integer not null default 0 check (today_active_s >= 0),
  today_idle_s integer not null default 0 check (today_idle_s >= 0),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_presence_user on public.presence ("user");

-- ---- attendance (written by the attendance function only) ---------------------------
create table public.attendance (
  id text primary key default public.new_id(),
  "user" uuid not null references public.profiles (id) on delete cascade,
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  status text not null check (status in ('present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'weekend')),
  first_activity_at timestamptz,
  last_activity_at timestamptz,
  active_s integer not null default 0 check (active_s >= 0),
  idle_s integer not null default 0 check (idle_s >= 0),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_attendance_user_date on public.attendance ("user", date);

-- ---- leave ---------------------------------------------------------------------
create table public.leave_types (
  id text primary key default public.new_id(),
  name text not null check (char_length(name) between 1 and 50),
  yearly_quota_days numeric not null default 0 check (yearly_quota_days >= 0),
  paid boolean not null default false,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_leave_types_name on public.leave_types (name);

create table public.leave_requests (
  id text primary key default public.new_id(),
  "user" uuid not null references public.profiles (id) on delete cascade,
  leave_type text not null references public.leave_types (id) on delete restrict, -- a used type can't be deleted
  start_date text not null check (start_date ~ '^\d{4}-\d{2}-\d{2}$'),
  end_date text not null check (end_date ~ '^\d{4}-\d{2}-\d{2}$'),
  half_day boolean not null default false,
  days numeric not null check (days >= 0.5),
  reason text not null default '' check (char_length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approver uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  comment text not null default '' check (char_length(comment) <= 1000),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index idx_leave_user_start on public.leave_requests ("user", start_date);

-- ---- calendar ---------------------------------------------------------------------
create table public.holidays (
  id text primary key default public.new_id(),
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  name text not null check (char_length(name) between 1 and 100),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_holidays_date on public.holidays (date);

create table public.events (
  id text primary key default public.new_id(),
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  description text not null default '' check (char_length(description) <= 2000),
  team text references public.teams (id) on delete set null, -- null = company-wide
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index idx_events_start on public.events (starts_at);

-- ---- payroll -----------------------------------------------------------------------
create table public.payroll_runs (
  id text primary key default public.new_id(),
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null check (status in ('draft', 'finalized')),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_payroll_runs_month on public.payroll_runs (month);

create table public.payroll_items (
  id text primary key default public.new_id(),
  run text not null references public.payroll_runs (id) on delete cascade,
  "user" uuid not null references public.profiles (id) on delete restrict,
  base numeric not null default 0 check (base >= 0),
  working_days numeric not null default 0 check (working_days >= 0),
  absent_days numeric not null default 0 check (absent_days >= 0),
  unpaid_leave_days numeric not null default 0 check (unpaid_leave_days >= 0),
  half_days numeric not null default 0 check (half_days >= 0),
  deductions numeric not null default 0 check (deductions >= 0),
  adjustment_pkr numeric not null default 0,
  note text not null default '' check (char_length(note) <= 500),
  net numeric not null default 0,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_payroll_items_run_user on public.payroll_items (run, "user");

-- ---- notifications (made by server functions) ---------------------------------------
create table public.notifications (
  id text primary key default public.new_id(),
  "user" uuid not null references public.profiles (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 50),
  payload jsonb,
  read_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index idx_notifications_user on public.notifications ("user", created);

-- ---- stars --------------------------------------------------------------------------
create table public.star_rules (
  id text primary key default public.new_id(),
  name text not null check (char_length(name) between 1 and 100),
  stars integer not null default 0 check (stars between 0 and 100),
  auto text not null default '' check (auto in ('', 'late', 'absent', 'half_day')), -- '' = given by hand
  description text not null default '' check (char_length(description) <= 500),
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_star_rules_name on public.star_rules (name);

create table public.star_records (
  id text primary key default public.new_id(),
  "user" uuid not null references public.profiles (id) on delete cascade,
  rule text not null references public.star_rules (id) on delete cascade,
  date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  note text not null default '' check (char_length(note) <= 500),
  given_by uuid references public.profiles (id) on delete set null,
  excused boolean not null default false, -- cancels an automatic rule's stars that day
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_star_records_user_rule_date on public.star_records ("user", rule, date);

-- ---- projects (clients and their calendars) -------------------------------------------
create table public.clients (
  id text primary key default public.new_id(),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 300),
  archived boolean not null default false,
  members uuid[] not null default '{}', -- profile ids
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create unique index idx_clients_name on public.clients (lower(name));

create table public.project_events (
  id text primary key default public.new_id(),
  client text not null references public.clients (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  description text not null default '' check (char_length(description) <= 2000),
  created_by uuid references public.profiles (id) on delete set null, -- stamped by a trigger
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
create index idx_project_events_client_start on public.project_events (client, starts_at);

-- ---- "updated" on every table ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'teams', 'salaries', 'org_settings', 'activity_segments', 'presence', 'attendance',
    'leave_types', 'leave_requests', 'holidays', 'events', 'payroll_runs', 'payroll_items', 'notifications',
    'star_rules', 'star_records', 'clients', 'project_events']
  loop
    execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated()', t);
  end loop;
end $$;

-- ---- default rows (PocketBase seed migration + stars migration) ----------------------------
insert into public.org_settings (shift_start, shift_end, work_days, grace_minutes, full_day_min_hours, half_day_min_hours,
  idle_threshold_minutes, timezone)
values ('09:00', '18:00', '[1,2,3,4,5]', 15, 8, 4, 5, 'Asia/Karachi');

insert into public.leave_types (name, yearly_quota_days, paid)
values ('Sick', 8, true), ('Casual', 10, true), ('Annual', 14, true);

insert into public.star_rules (name, stars, auto, description) values
  ('Late arrival', 0, 'late', 'First activity after the shift start plus the grace period (attendance: Late).'),
  ('Absent without leave', 0, 'absent', 'A working day with no activity and no approved leave (attendance: Absent).'),
  ('Short hours', 0, 'half_day', 'Active for less than the half-day hours (attendance: Half day).');
