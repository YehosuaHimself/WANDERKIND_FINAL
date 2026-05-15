-- ════════════════════════════════════════════════════════════
-- Wanderkind · stamps · EPIC 05
--
-- One stamp per accepted stay. Mutual + simultaneous vouching (covered by
-- EPIC 04 slice 2) writes both vouch_text (by walker, about host) and
-- host_reply (by host, replying). Both are optional — a stamp can exist
-- with just the date + host name, like a passport entry.
-- ════════════════════════════════════════════════════════════

create table if not exists stamps (
  id uuid primary key default gen_random_uuid(),
  walker_id    uuid references profiles(id) on delete cascade not null,
  host_id      uuid references profiles(id) on delete cascade not null,
  stay_id      uuid references stays(id)    on delete set null,
  stayed_on    date  not null,
  region_label text,
  vouch_text   text,
  host_reply   text,
  created_at   timestamptz default now(),
  constraint stamps_no_self check (walker_id <> host_id)
);

create index if not exists stamps_walker_idx on stamps(walker_id, stayed_on desc);
create index if not exists stamps_host_idx   on stamps(host_id, stayed_on desc);

alter table stamps enable row level security;

drop policy if exists "walker reads own stamps" on stamps;
create policy "walker reads own stamps"
  on stamps for select
  using (walker_id = auth.uid());

drop policy if exists "host reads own gastebuch" on stamps;
create policy "host reads own gastebuch"
  on stamps for select
  using (host_id = auth.uid());

drop policy if exists "walker writes own vouch" on stamps;
create policy "walker writes own vouch"
  on stamps for insert
  with check (walker_id = auth.uid());

drop policy if exists "host updates own reply" on stamps;
create policy "host updates own reply"
  on stamps for update
  using (host_id = auth.uid())
  with check (host_id = auth.uid());
