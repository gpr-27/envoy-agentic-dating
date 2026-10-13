-- Agentic dating site schema. Records are stored as validated JSON documents
-- (see src/lib/contracts.ts) with a few indexed columns for lookups.
-- Access is server-only through the service-role key; RLS is enabled with no
-- policies so the anon/public keys can read or write nothing.

create table if not exists people (
  id text primary key,
  pool text not null,
  slug text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  data jsonb not null,
  unique (pool, slug)
);
create index if not exists people_pool_idx on people (pool);

create table if not exists sources (
  person_id text primary key references people (id) on delete cascade,
  pool text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists profiles (
  person_id text primary key references people (id) on delete cascade,
  pool text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists profiles_pool_idx on profiles (pool);

create table if not exists dates (
  id text primary key,
  pool text not null,
  a_id text not null,
  b_id text not null,
  created_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists dates_pool_idx on dates (pool);
-- One date per pair per pool, regardless of who asked whom.
create unique index if not exists dates_pair_uniq
  on dates (pool, least(a_id, b_id), greatest(a_id, b_id));

create table if not exists rankings (
  person_id text primary key references people (id) on delete cascade,
  pool text not null,
  data jsonb not null,
  computed_at timestamptz not null default now()
);
create index if not exists rankings_pool_idx on rankings (pool);

create table if not exists usage (
  key text primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists locks (
  name text primary key,
  locked_until timestamptz not null
);

-- Atomic counter used for free-tier quota accounting and rate limiting.
create or replace function incr_usage(k text, n integer default 1)
returns integer
language sql
set search_path = public
as $$
  insert into usage (key, count, updated_at) values (k, n, now())
  on conflict (key) do update set count = usage.count + excluded.count, updated_at = now()
  returning count;
$$;

-- Lease-style lock: succeeds if the lock is free or expired.
create or replace function try_lock(lock_name text, ttl_ms integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  got boolean;
begin
  insert into locks (name, locked_until)
  values (lock_name, now() + make_interval(secs => ttl_ms / 1000.0))
  on conflict (name) do update
    set locked_until = excluded.locked_until
    where locks.locked_until < now()
  returning true into got;
  return coalesce(got, false);
end;
$$;

alter table people enable row level security;
alter table sources enable row level security;
alter table profiles enable row level security;
alter table dates enable row level security;
alter table rankings enable row level security;
alter table usage enable row level security;
alter table locks enable row level security;

-- Server-only access. Only the service role (used by the Next.js server) may
-- touch these tables or call the helper functions; the public anon /
-- authenticated roles get nothing, whatever the Data API defaults are.
revoke all on people, sources, profiles, dates, rankings, usage, locks from anon, authenticated;
grant select, insert, update, delete on people, sources, profiles, dates, rankings, usage, locks to service_role;
revoke execute on function incr_usage(text, integer) from public, anon, authenticated;
revoke execute on function try_lock(text, integer) from public, anon, authenticated;
grant execute on function incr_usage(text, integer) to service_role;
grant execute on function try_lock(text, integer) to service_role;
