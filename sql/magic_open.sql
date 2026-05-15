-- ════════════════════════════════════════════════════════════
-- Wanderkind · Magic Open
-- Hosts pair a smart lock once; a per-stay HMAC seed (host_locks.secret)
-- is combined with the stay id + window index to derive a rotating
-- 4-digit door code in-browser via crypto.subtle.
-- ════════════════════════════════════════════════════════════

create table if not exists host_locks (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references profiles(id) on delete cascade unique,
  brand text,
  label text,
  secret text not null,
  paired_at timestamptz default now()
);

create table if not exists stays (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references profiles(id) on delete cascade,
  guest_id uuid references profiles(id) on delete cascade,
  arrives_at timestamptz not null,
  leaves_at timestamptz,
  status text default 'pending' check (status in ('pending', 'active', 'past', 'cancelled')),
  created_at timestamptz default now()
);

create index if not exists stays_host_idx on stays(host_id, status);
create index if not exists stays_guest_idx on stays(guest_id, status);

alter table host_locks enable row level security;
alter table stays enable row level security;

drop policy if exists "host reads own lock" on host_locks;
create policy "host reads own lock"
  on host_locks for select
  using (host_id = auth.uid());

drop policy if exists "host writes own lock" on host_locks;
create policy "host writes own lock"
  on host_locks for all
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

drop policy if exists "host reads own stays" on stays;
create policy "host reads own stays"
  on stays for select
  using (host_id = auth.uid());

drop policy if exists "guest reads own stays" on stays;
create policy "guest reads own stays"
  on stays for select
  using (guest_id = auth.uid());
