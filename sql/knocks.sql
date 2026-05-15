-- ════════════════════════════════════════════════════════════
-- Wanderkind · knocks · EPIC 04 slice 1
--
-- A walker knocks at a host's door. The host accepts or declines.
-- Once accepted, a stay row gets minted (slice 2 will wire that).
-- ════════════════════════════════════════════════════════════

create table if not exists knocks (
  id uuid primary key default gen_random_uuid(),
  host_id   uuid references profiles(id) on delete cascade not null,
  walker_id uuid references profiles(id) on delete cascade not null,
  message   text,
  status    text default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at  timestamptz default now(),
  resolved_at timestamptz,
  constraint knocks_no_self check (host_id <> walker_id)
);

create index if not exists knocks_host_pending_idx on knocks(host_id, created_at) where status = 'pending';
create index if not exists knocks_walker_idx on knocks(walker_id, created_at);

alter table knocks enable row level security;

drop policy if exists "host reads own incoming knocks" on knocks;
create policy "host reads own incoming knocks"
  on knocks for select
  using (host_id = auth.uid());

drop policy if exists "walker reads own outgoing knocks" on knocks;
create policy "walker reads own outgoing knocks"
  on knocks for select
  using (walker_id = auth.uid());

drop policy if exists "walker writes own knocks" on knocks;
create policy "walker writes own knocks"
  on knocks for insert
  with check (walker_id = auth.uid());

drop policy if exists "host updates own knocks" on knocks;
create policy "host updates own knocks"
  on knocks for update
  using (host_id = auth.uid())
  with check (host_id = auth.uid());
