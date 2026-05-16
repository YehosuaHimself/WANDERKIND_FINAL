-- ════════════════════════════════════════════════════════════
-- WANDERKIND · 00_apply_all.sql · v5 · MASTER PASS
--
-- Paste into Supabase SQL editor, run once. Idempotent.
-- After applying, the prototype master pass is live end-to-end:
--   · stamps with categories + tier-1/2/3 + proof blob + seeded dies
--   · stamp proposals + signatures + canon + promote_to_canon RPC
--   · feed posts (stamps + road) + hearts
--   · walks (48h ephemeral) + walk_members
--   · profile photos jsonb + journey_tier + snooze_until + donation_based
-- ════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- ─── host_offers.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · Map v2 · host_offers column
--
-- Adds a jsonb array to profiles describing what each host offers:
--   ['bed'] · ['bed', 'food'] · ['food'] · ['water']
--
-- The map renderer (/js/map-boot.js) reads this to pick the right
-- glyph (host-bed, host-bed-food, host-food, host-water).
-- Existing rows default to ['bed'] so they keep showing as full hosts.
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists host_offers jsonb default '["bed"]'::jsonb;

-- Optional: index for fast filter queries
create index if not exists profiles_host_offers_idx on profiles using gin (host_offers);

-- Public read of these columns (subject to existing RLS show_profile_public)
-- is already permitted by the parent policy; no extra grants needed.


-- ─────────────────────────────────────────────────────────────
-- ─── pin_hash.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · ID · user-settable PIN
--
-- The PIN is hashed client-side (PBKDF2-SHA256, 100k iterations,
-- 32-byte output) with the user.id as the salt, then base64-encoded
-- and stored on profiles.pin_hash. The server never sees the PIN.
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists pin_hash text;
alter table profiles add column if not exists pin_updated_at timestamptz;

-- No public SELECT on pin_hash — only the owner can read or write.
-- Assumes the existing profile RLS policy already scopes to auth.uid().


-- ─────────────────────────────────────────────────────────────
-- ─── youth.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · youth · EPIC 06
--
-- Under-18 bearers get a supervisor relationship. The supervisor is an
-- adult Wanderkind who accompanies them. The ID shows the supervisor's
-- name. Magic Open codes are not generated for unsupervised minors.
--
-- The "Troop" credential (scout leader → many minors) is slice 2; this
-- ships the 1-to-1 supervisor relationship first.
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists dob date;
alter table profiles add column if not exists supervisor_id uuid references profiles(id) on delete set null;

create index if not exists profiles_supervisor_idx on profiles(supervisor_id);

-- Convenience view: returns true when the bearer is under 18 today
create or replace function is_minor(p_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select (current_date - dob) < 18 * 365 from profiles where id = p_id),
    false
  )
$$;


-- ─────────────────────────────────────────────────────────────
-- ─── host_setup.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · host_setup · the full host loop
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists host_bio       text;
alter table profiles add column if not exists house_rules    jsonb default '[]'::jsonb;
alter table profiles add column if not exists host_languages jsonb default '[]'::jsonb;
alter table profiles add column if not exists host_paused    boolean default false;
alter table profiles add column if not exists quiet_hours    jsonb default '{"start":"22:00","end":"07:00"}'::jsonb;
alter table profiles add column if not exists host_capacity  smallint default 1;
alter table profiles add column if not exists host_specialty text;


-- ─────────────────────────────────────────────────────────────
-- ─── messages.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · Messages (end-to-end encrypted)
-- Each Wanderkind has a public_key on their profile.
-- Threads are pairwise; the server only stores ciphertext.
-- ════════════════════════════════════════════════════════════

alter table profiles add column if not exists public_key jsonb;

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists message_thread_members (
  thread_id uuid references message_threads(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (thread_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references message_threads(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  created_at timestamptz default now()
);

create index if not exists messages_thread_idx on messages(thread_id, created_at);

alter table message_threads enable row level security;
alter table message_thread_members enable row level security;
alter table messages enable row level security;

-- Avoid recursive RLS via SECURITY DEFINER helper
create or replace function is_thread_member(t uuid, u uuid)
returns boolean
language sql
security definer
stable
as $$ select exists (
  select 1 from message_thread_members
  where thread_id = t and user_id = u
) $$;

drop policy if exists "members read threads" on message_threads;
create policy "members read threads"
  on message_threads for select
  using (is_thread_member(id, auth.uid()));

drop policy if exists "members read membership" on message_thread_members;
create policy "members read membership"
  on message_thread_members for select
  using (is_thread_member(thread_id, auth.uid()));

drop policy if exists "members read messages" on messages;
create policy "members read messages"
  on messages for select
  using (is_thread_member(thread_id, auth.uid()));

drop policy if exists "members write messages" on messages;
create policy "members write messages"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and is_thread_member(thread_id, auth.uid())
  );

-- Atomic two-party thread creation
create or replace function start_thread_with(other uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  me uuid := auth.uid();
  t uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = other then raise exception 'cannot start thread with yourself'; end if;
  -- find existing 1-1 thread
  select t1.thread_id into t
  from message_thread_members t1
  join message_thread_members t2 on t1.thread_id = t2.thread_id
  where t1.user_id = me and t2.user_id = other
  limit 1;
  if t is not null then return t; end if;
  insert into message_threads default values returning id into t;
  insert into message_thread_members (thread_id, user_id) values (t, me), (t, other);
  return t;
end $$;


-- ─────────────────────────────────────────────────────────────
-- ─── magic_open.sql
-- ─────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────
-- ─── knocks.sql
-- ─────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────
-- ─── stamps.sql
-- ─────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────
-- ─── vouch.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · vouch ceremony · the morning after
--
-- Both walker and host write one line, blind, in parallel.
-- When BOTH drafts are locked, publish_vouches() atomically mints two
-- stamps (one for the walker's Wanderbuch, one for the host's
-- Gästebuch) and marks the stay as past.
-- ════════════════════════════════════════════════════════════

create table if not exists vouch_drafts (
  id uuid primary key default gen_random_uuid(),
  stay_id   uuid references stays(id) on delete cascade not null,
  writer_id uuid references profiles(id) on delete cascade not null,
  text      text,
  locked_at timestamptz,
  created_at timestamptz default now(),
  unique (stay_id, writer_id)
);

alter table vouch_drafts enable row level security;

-- Helper: was this writer a participant in this stay?
create or replace function vouch_can_write(s uuid, u uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from stays
    where id = s
      and (host_id = u or guest_id = u)
  );
$$;

drop policy if exists "participants read drafts" on vouch_drafts;
create policy "participants read drafts"
  on vouch_drafts for select
  using (writer_id = auth.uid() OR vouch_can_write(stay_id, auth.uid()));

drop policy if exists "writer writes own draft" on vouch_drafts;
create policy "writer writes own draft"
  on vouch_drafts for insert
  with check (writer_id = auth.uid() and vouch_can_write(stay_id, auth.uid()));

drop policy if exists "writer updates own draft" on vouch_drafts;
create policy "writer updates own draft"
  on vouch_drafts for update
  using (writer_id = auth.uid())
  with check (writer_id = auth.uid());

-- RPC: publish vouches → mints stamps + marks stay past
create or replace function publish_vouches(p_stay uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  s record;
  v_walker text;
  v_host   text;
  region   text;
begin
  select * into s from stays where id = p_stay;
  if not found then return false; end if;

  select text into v_walker from vouch_drafts where stay_id = p_stay and writer_id = s.guest_id;
  select text into v_host   from vouch_drafts where stay_id = p_stay and writer_id = s.host_id;

  if v_walker is null or v_host is null then return false; end if;
  if (select locked_at from vouch_drafts where stay_id = p_stay and writer_id = s.guest_id) is null then return false; end if;
  if (select locked_at from vouch_drafts where stay_id = p_stay and writer_id = s.host_id) is null then return false; end if;

  select last_location_label into region from profiles where id = s.host_id;

  -- Mint one stamp on the walker's Wanderbuch (vouch by walker, reply by host)
  insert into stamps (walker_id, host_id, stay_id, stayed_on, region_label, vouch_text, host_reply)
  values (s.guest_id, s.host_id, s.id, coalesce(s.arrives_at::date, current_date),
          region, v_walker, v_host)
  on conflict do nothing;

  -- (Optional symmetry: a stamp on the host's view is the same row; the host
  --  reads via host_id = me. We don't double-insert.)

  -- Mark stay as past
  update stays set status = 'past' where id = p_stay and status <> 'past';

  return true;
end $$;


-- ─────────────────────────────────────────────────────────────
-- ─── loop.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · loop · close knock → stay → vouch → stamp
-- ════════════════════════════════════════════════════════════

-- One stay per knock (idempotency)
alter table stays add column if not exists knock_id uuid references knocks(id) on delete set null;
create unique index if not exists stays_knock_unique on stays(knock_id) where knock_id is not null;

-- One stamp per stay (idempotency on retry)
alter table stamps add column if not exists stay_unique_guard text generated always as (stay_id::text) stored;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stamps_one_per_stay') then
    alter table stamps add constraint stamps_one_per_stay unique (stay_id);
  end if;
exception when others then null; end $$;

-- RPC: host accepts a knock → atomically:
--   1. Mark knock as accepted
--   2. Mint a stay row (if not already minted)
--   3. Return the stay id
create or replace function accept_knock_to_stay(p_knock uuid, p_arrives_at timestamptz default null)
returns uuid
language plpgsql
security definer
as $$
declare
  k record;
  s_id uuid;
begin
  select * into k from knocks where id = p_knock;
  if not found then raise exception 'knock not found'; end if;
  if k.host_id <> auth.uid() then raise exception 'not your knock'; end if;
  if k.status <> 'pending' then raise exception 'knock already resolved'; end if;

  -- Mark knock as accepted
  update knocks
  set status = 'accepted', resolved_at = now()
  where id = p_knock;

  -- Mint a stay if one doesn't already exist for this knock
  select id into s_id from stays where knock_id = p_knock;
  if s_id is null then
    insert into stays (host_id, guest_id, arrives_at, status, knock_id)
    values (k.host_id, k.walker_id, coalesce(p_arrives_at, now()), 'active', p_knock)
    returning id into s_id;
  end if;

  return s_id;
end $$;

-- RPC: host declines a knock
create or replace function decline_knock(p_knock uuid)
returns void
language plpgsql
security definer
as $$
declare
  k record;
begin
  select * into k from knocks where id = p_knock;
  if not found then raise exception 'knock not found'; end if;
  if k.host_id <> auth.uid() then raise exception 'not your knock'; end if;
  update knocks
  set status = 'declined', resolved_at = now()
  where id = p_knock;
end $$;


-- ─────────────────────────────────────────────────────────────
-- ─── master_pass.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · master_pass.sql · prototype-to-live migration
-- Adds everything the 22-screen master pass needs.
-- ════════════════════════════════════════════════════════════

-- ─── stamp categories + proof + die seed ─────────────
alter table stamps add column if not exists category text default 'other' check (category in ('church','mountain','festival','other'));
alter table stamps add column if not exists proof_blob jsonb default '{}'::jsonb;
alter table stamps add column if not exists die_seed bigint;  -- seeded SVG die randomisation
create index if not exists stamps_category_idx on stamps(category);

-- ─── profile extensions for 7-image grid + journey tier ─────
alter table profiles add column if not exists photos jsonb default '[]'::jsonb;
alter table profiles add column if not exists donation_based boolean default false;
alter table profiles add column if not exists snooze_until timestamptz;
alter table profiles add column if not exists journey_tier text default 'wochenend' check (journey_tier in ('wochenend','wandersmann','ehrenmann','prinzen','koenigs'));

-- ─── stamp proposals (three-tier model) ─────────────
create table if not exists stamp_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  category text not null check (category in ('church','mountain','festival','other')),
  lat double precision not null,
  lng double precision not null,
  photo_url text,
  tier smallint default 3 check (tier in (1,2,3)),
  signature_count int default 1,
  created_at timestamptz default now()
);
create index if not exists stamp_proposals_coords_idx on stamp_proposals(lat, lng);

-- One row per signature on a proposed stamp
create table if not exists stamp_signatures (
  proposal_id uuid references stamp_proposals(id) on delete cascade not null,
  signer_id uuid references profiles(id) on delete cascade not null,
  signed_at timestamptz default now(),
  primary key (proposal_id, signer_id)
);

-- The canonical Tier-1 atlas of stamps · seeded by Wanderkind Inc.
create table if not exists stamp_canon (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references stamp_proposals(id) on delete set null,
  name text not null,
  category text not null,
  lat double precision not null,
  lng double precision not null,
  tier smallint default 1,
  promoted_at timestamptz default now()
);
create index if not exists stamp_canon_coords_idx on stamp_canon(lat, lng);

alter table stamp_proposals enable row level security;
alter table stamp_signatures enable row level security;
alter table stamp_canon enable row level security;

drop policy if exists "public read proposals" on stamp_proposals;
create policy "public read proposals" on stamp_proposals for select using (true);
drop policy if exists "proposer writes own" on stamp_proposals;
create policy "proposer writes own" on stamp_proposals for insert with check (proposer_id = auth.uid());

drop policy if exists "public read sigs" on stamp_signatures;
create policy "public read sigs" on stamp_signatures for select using (true);
drop policy if exists "signer writes own sig" on stamp_signatures;
create policy "signer writes own sig" on stamp_signatures for insert with check (signer_id = auth.uid());

drop policy if exists "public read canon" on stamp_canon;
create policy "public read canon" on stamp_canon for select using (true);

-- RPC: promote a proposal to canon when it crosses 5 distinct signers
create or replace function promote_to_canon(p_proposal uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  prop record;
  sig_count int;
begin
  select * into prop from stamp_proposals where id = p_proposal;
  if not found then return false; end if;
  select count(distinct signer_id) into sig_count from stamp_signatures where proposal_id = p_proposal;
  if sig_count >= 5 and prop.tier > 1 then
    update stamp_proposals set tier = 1 where id = p_proposal;
    insert into stamp_canon (proposal_id, name, category, lat, lng, tier)
    values (prop.id, prop.name, prop.category, prop.lat, prop.lng, 1)
    on conflict do nothing;
    return true;
  end if;
  return false;
end $$;

-- ─── feed_posts · two kinds (stamp + road) ─────────
create table if not exists feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references profiles(id) on delete cascade not null,
  kind text not null check (kind in ('stamp','road')),
  body_text text,
  image_url text,
  related_stamp_id uuid references stamps(id) on delete set null,
  hearts_count int default 0,
  created_at timestamptz default now()
);
create index if not exists feed_posts_recent_idx on feed_posts(created_at desc);

create table if not exists feed_hearts (
  post_id uuid references feed_posts(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  hearted_at timestamptz default now(),
  primary key (post_id, user_id)
);

alter table feed_posts enable row level security;
alter table feed_hearts enable row level security;

drop policy if exists "public read posts" on feed_posts;
create policy "public read posts" on feed_posts for select using (true);
drop policy if exists "author writes own post" on feed_posts;
create policy "author writes own post" on feed_posts for insert with check (author_id = auth.uid());

drop policy if exists "public read hearts" on feed_hearts;
create policy "public read hearts" on feed_hearts for select using (true);
drop policy if exists "user writes own heart" on feed_hearts;
create policy "user writes own heart" on feed_hearts for insert with check (user_id = auth.uid());
drop policy if exists "user removes own heart" on feed_hearts;
create policy "user removes own heart" on feed_hearts for delete using (user_id = auth.uid());

-- ─── walks · 48-hour ephemeral groups ─────────────
create table if not exists walks (
  id uuid primary key default gen_random_uuid(),
  started_by uuid references profiles(id) on delete cascade not null,
  kind text not null check (kind in ('walking','rest','gathering')),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  started_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '48 hours')
);

create table if not exists walk_members (
  walk_id uuid references walks(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  joined_at timestamptz default now(),
  primary key (walk_id, user_id)
);

create index if not exists walks_live_idx on walks(expires_at) where expires_at > now();

alter table walks enable row level security;
alter table walk_members enable row level security;

drop policy if exists "public read live walks" on walks;
create policy "public read live walks" on walks for select using (expires_at > now());
drop policy if exists "starter writes own walk" on walks;
create policy "starter writes own walk" on walks for insert with check (started_by = auth.uid());

drop policy if exists "public read walk members" on walk_members;
create policy "public read walk members" on walk_members for select using (true);
drop policy if exists "user joins own" on walk_members;
create policy "user joins own" on walk_members for insert with check (user_id = auth.uid());
drop policy if exists "user leaves own" on walk_members;
create policy "user leaves own" on walk_members for delete using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- ─── seed_doors.sql
-- ─────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════
-- Wanderkind · seed_doors.sql · EPIC 03
--
-- Thirty hand-picked initial Wanderkind doors across the launch corridor.
-- Each is a "system" profile (auth.users id is generated; no email).
-- Map renderer reads show_on_map + host_offers and draws the right glyph.
--
-- Run AFTER auth.users has the rows. We use gen_random_uuid() for user ids;
-- the demo rows are tagged with is_demo=true so production cleanup is easy.
--
-- Coverage:
--   Camino del Norte / Frances        × 10 doors
--   Königsweg + Hochkönig region       ×  8 doors
--   Pfänder / Vorarlberg ridge         ×  6 doors
--   Schwarzwald + Bodensee             ×  6 doors
-- ════════════════════════════════════════════════════════════

-- Ensure the optional flag for demo rows exists (idempotent)
alter table profiles add column if not exists is_demo boolean default false;

-- Helper: insert a seeded host that doesn't need auth.users
create or replace function seed_door(
  p_trail_name text,
  p_wkid       text,
  p_lat        double precision,
  p_lng        double precision,
  p_offers     jsonb,
  p_region     text,
  p_bio        text
) returns void
language plpgsql
security definer
as $$
declare
  uid uuid;
begin
  uid := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, aud, role)
  values (
    uid,
    'seed-' || p_wkid || '@wanderkind.local',
    jsonb_build_object('trail_name', p_trail_name, 'seeded', true),
    now(), now(), 'authenticated', 'authenticated'
  )
  on conflict (email) do nothing;
  insert into profiles (id, trail_name, wanderkind_id, lat, lng, host_offers,
                        show_on_map, is_demo, last_location_label, bio, created_at)
  values (
    uid, p_trail_name, p_wkid, p_lat, p_lng, p_offers,
    true, true, p_region, p_bio, now()
  )
  on conflict (id) do nothing;
end $$;

-- ─── Camino del Norte / Francés ─────────────────────────────────
select seed_door('Marian Hofer',     'CMN-MARIA',  42.819, -1.644,  '["bed","food"]'::jsonb, 'Pamplona · Navarra',     'Stone farmhouse on the Camino. Two beds. Bread in the morning.');
select seed_door('Helmut Winkler',   'CMN-HELMW',  42.795, -1.610,  '["bed","food"]'::jsonb, 'Pamplona · Navarra',     'Twenty years of Camino walkers. The fire is always lit.');
select seed_door('Ana Beltrán',      'CMN-ANABE',  42.611, -2.107,  '["bed"]'::jsonb,         'Estella · Navarra',      'A bed and a quiet kitchen on the Calle Mayor.');
select seed_door('Tomasz Iwicki',    'CMN-TOMSI',  42.467, -2.450,  '["bed","food"]'::jsonb,  'Logroño · La Rioja',     'Three beds. Tortilla on Sundays.');
select seed_door('Sofia Ribera',     'CMN-SOFRA',  42.348, -3.700,  '["bed"]'::jsonb,         'Burgos · Castilla y León','Beside the cathedral. Tea before sleep.');
select seed_door('Padre Aurelio',    'CMN-PAUR1',  42.000, -4.530,  '["water","food"]'::jsonb,'Frómista · Castilla y León','No bed — but water and the soup pot is always on.');
select seed_door('Lucía Galván',     'CMN-LUCGA',  42.598, -5.567,  '["bed","food"]'::jsonb,  'León · Castilla y León', 'Four beds, garden, vegetables on Thursdays.');
select seed_door('Mateo Ferreiro',   'CMN-MATFE',  42.873, -8.546,  '["bed","food"]'::jsonb,  'Santiago · Galicia',     'A bed in Galicia at the end of the long road. Empanada with octopus.');
select seed_door('Ines Castaño',     'CMN-INECA',  42.910, -8.566,  '["water"]'::jsonb,       'Santiago · Galicia',     'Water and a bench by the gate — for the final 100 metres.');
select seed_door('Reverend Bilbao',  'CMN-BILBA',  43.260, -2.935,  '["bed"]'::jsonb,         'Bilbao · País Vasco',    'A bed in the city before the trail. No food but coffee at dawn.');

-- ─── Königsweg / Hochkönig spine ───────────────────────────────
select seed_door('Anna Rieser',      'KGW-ANNAR',  47.502,  9.749,  '["bed","food"]'::jsonb,  'Bregenz · Vorarlberg',   'Above the lake. Two beds, fresh bread from the bakery downstairs.');
select seed_door('Karl Brunner',     'KGW-KARBR',  47.456,  9.732,  '["water"]'::jsonb,       'Bregenz · Vorarlberg',   'Water and a kind word at the foot of the Pfänder.');
select seed_door('Lisa Egger',       'KGW-LISEG',  47.392,  9.928,  '["bed","food"]'::jsonb,  'Dornbirn · Vorarlberg',  'A spare room. Käsknöpfle for those who arrive late.');
select seed_door('Hans Plattner',    'KGW-HANPL',  47.250, 10.182,  '["bed"]'::jsonb,         'Lech · Tirol',           'Wooden bed under the eaves. Coffee before sunrise.');
select seed_door('Maria Kerschb.',   'KGW-MARKE',  47.295, 13.066,  '["bed","food"]'::jsonb,  'Hochkönig · Salzburg',   'Refuge on the way to the summit. Soup, bread, two bunks.');
select seed_door('Sebastian Mohr',   'KGW-SEBM1',  47.467, 13.043,  '["bed"]'::jsonb,         'Dienten · Salzburg',     'Berg am Hochkönig. The bed by the window faces the wall.');
select seed_door('Theresa Voggen.',  'KGW-THEVO',  47.700, 13.018,  '["water","food"]'::jsonb,'Saalfelden · Salzburg',  'No bed today, but apricot strudel and refill water.');
select seed_door('Walter Pichler',   'KGW-WALPI',  47.798, 13.043,  '["bed","food"]'::jsonb,  'Zell am See · Salzburg', 'Three beds. Fish from the lake when the catch is good.');

-- ─── Pfänder / Bodensee ridge ──────────────────────────────────
select seed_door('Friedrich Lauter', 'PFD-FRILA',  47.510,  9.756,  '["bed"]'::jsonb,         'Lochau · Vorarlberg',    'One bed by the kitchen. Bring a quiet voice.');
select seed_door('Greta Schober',    'PFD-GRESC',  47.516,  9.778,  '["food"]'::jsonb,        'Lochau · Vorarlberg',    'No room for a bed but coffee, cake, and an hour at the table.');
select seed_door('Markus Pfeil',     'PFD-MARPF',  47.564,  9.741,  '["bed","food"]'::jsonb,  'Hörbranz · Vorarlberg',  'A bed and Sunday breakfast.');
select seed_door('Karoline Rieger',  'PFD-KARRI',  47.563,  9.852,  '["water","food"]'::jsonb,'Hergensweiler · Bayern', 'Water + a slice of bread for the road.');
select seed_door('Johann Riedl',     'PFD-JOHRI',  47.587,  9.857,  '["bed"]'::jsonb,         'Lindau · Bayern',        'A bed two streets from the harbour.');
select seed_door('Petra Reuter',     'PFD-PETRE',  47.626,  9.713,  '["food"]'::jsonb,        'Hard · Vorarlberg',      'A meal on Thursday evenings. No bed yet.');

-- ─── Schwarzwald + Bodensee ────────────────────────────────────
select seed_door('Klara Berger',     'SCH-KLABE',  48.013,  7.852,  '["bed","food"]'::jsonb,  'Freiburg · Baden-Württemberg', 'Two beds in the Altstadt. Picnic basket for Day 2.');
select seed_door('Otto Henne',       'SCH-OTTHE',  48.000,  8.300,  '["bed"]'::jsonb,         'Hinterzarten · BW',      'High wooden bed. Forest at the back door.');
select seed_door('Brigitte Adler',   'SCH-BRIAD',  47.762,  8.227,  '["water","food"]'::jsonb,'Bonndorf · BW',          'A spring in the garden + cheese from the village.');
select seed_door('Werner Stoll',     'SCH-WERST',  47.659,  9.176,  '["bed","food"]'::jsonb,  'Konstanz · BW',          'A room with a view of the Bodensee. Two beds, one window.');
select seed_door('Elena Petrov',     'SCH-ELEPE',  47.694,  9.180,  '["water"]'::jsonb,       'Konstanz · BW',          'Fountain refill outside the gate. A bench in the sun.');
select seed_door('Andreas Wagner',   'SCH-ANDWA',  47.812,  9.628,  '["bed","food"]'::jsonb,  'Lindau (Insel) · Bayern','A bed on the island. Lake fish, hot stove.');

-- Drop the helper when we're done (optional — keep if seeding more later)
-- drop function if exists seed_door(text,text,double precision,double precision,jsonb,text,text);

-- ─── Verify
select count(*) as seeded_doors from profiles where is_demo = true;


-- ============================================================================
-- master_pass_v2.sql · EPIC 11 · mandatory FaceScan in onboarding
-- ============================================================================
-- ============================================================================
-- master_pass_v2.sql · EPIC 11 · mandatory FaceScan in onboarding
-- ============================================================================
-- Adds:
--   1. profiles.face_verified_at (timestamptz) — when the user passed liveness
--   2. face_verifications table — audit log of every scan attempt
--   3. verify_face RPC — records a scan + sets face_verified_at on success
--   4. journey_tier guard — Verified Walker requires face_verified_at
-- ============================================================================

-- 1. profile column
alter table profiles
  add column if not exists face_verified_at timestamptz;

-- 2. audit log table (own row only, never exposed publicly)
create table if not exists face_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade not null,
  frame_hash_1 text not null,
  frame_hash_2 text not null,
  frame_hash_3 text not null,
  liveness     numeric(4,3) not null check (liveness between 0 and 1),
  passed       boolean not null,
  provider     text not null default 'heuristic-v1',
  created_at   timestamptz default now()
);

create index if not exists face_verifications_user_idx
  on face_verifications(user_id, created_at desc);

alter table face_verifications enable row level security;

drop policy if exists "user reads own face audits" on face_verifications;
create policy "user reads own face audits"
  on face_verifications for select
  using (user_id = auth.uid());

-- (writes happen only via verify_face RPC, never direct)

-- 3. RPC — single entry point, server-controlled passing rule
create or replace function verify_face(
  p_hash_1   text,
  p_hash_2   text,
  p_hash_3   text,
  p_liveness numeric,
  p_provider text default 'heuristic-v1'
) returns jsonb
language plpgsql security definer
as $$
declare
  v_uid   uuid := auth.uid();
  v_pass  boolean;
  v_row   face_verifications;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not signed in');
  end if;

  -- reject if hashes are duplicates of each other (replayed frame)
  if p_hash_1 = p_hash_2 or p_hash_2 = p_hash_3 or p_hash_1 = p_hash_3 then
    v_pass := false;
  else
    v_pass := p_liveness >= 0.62;
  end if;

  insert into face_verifications(user_id, frame_hash_1, frame_hash_2, frame_hash_3,
                                 liveness, passed, provider)
    values (v_uid, p_hash_1, p_hash_2, p_hash_3,
            greatest(0, least(1, p_liveness)), v_pass, p_provider)
    returning * into v_row;

  if v_pass then
    -- face verification is independent of journey_tier (which is earned by
    -- walks/stamps/vouches). We only mark the door-key here.
    update profiles
       set face_verified_at = coalesce(face_verified_at, now())
     where id = v_uid;
  end if;

  return jsonb_build_object(
    'ok',       v_pass,
    'id',       v_row.id,
    'verified', v_pass
  );
end;
$$;

grant execute on function verify_face(text,text,text,numeric,text) to authenticated;

-- ============================================================================
-- end master_pass_v2.sql
-- ============================================================================

-- ============================================================================
-- seed_walker_hosts.sql · 15 walker-hosts (Wanderkinder who walk AND host)
-- ============================================================================
-- ════════════════════════════════════════════════════════════
-- seed_walker_hosts.sql · the first Wanderkinder
--
-- 15 demo profiles who BOTH walk and host. They show up on the map
-- with full host_offers AND is_walking=true so the map feels alive
-- before real signups arrive.
--
-- Naming convention: prefix WHO- (Walker-Host) so cleanup is easy:
--   delete from profiles where wanderkind_id like 'WHO-%' and is_demo;
-- ════════════════════════════════════════════════════════════

create or replace function seed_walker_host(
  p_trail_name text,
  p_wkid       text,
  p_lat        double precision,
  p_lng        double precision,
  p_offers     jsonb,
  p_region     text,
  p_bio        text
) returns void
language plpgsql
security definer
as $$
declare
  uid uuid;
begin
  uid := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, aud, role)
  values (
    uid,
    'wkr-' || p_wkid || '@wanderkind.local',
    jsonb_build_object('trail_name', p_trail_name, 'seeded', true),
    now(), now(), 'authenticated', 'authenticated'
  )
  on conflict (email) do nothing;
  insert into profiles (id, trail_name, wanderkind_id, lat, lng, host_offers,
                        show_on_map, is_walking, is_demo,
                        last_location_label, bio, created_at)
  values (
    uid, p_trail_name, p_wkid, p_lat, p_lng, p_offers,
    true, true, true, p_region, p_bio, now()
  )
  on conflict (id) do nothing;
end $$;

-- ─── Camino del Norte (3) ────────────────────────────────────
select seed_walker_host('Lukas Reinhart',    'WHO-LUKRE',  42.815, -1.647,  '["bed","food"]'::jsonb,    'Pamplona · Navarra',     'Walking the Camino each summer. Two beds when I am at home.');
select seed_walker_host('Marta Olivares',    'WHO-MAROL',  42.668, -2.029,  '["food","water"]'::jsonb,  'Estella · Navarra',      'Living between the Camino and Logroño. Soup pot is always on.');
select seed_walker_host('Pere Caselles',     'WHO-PERCA',  42.466, -2.450,  '["bed"]'::jsonb,           'Logroño · La Rioja',     'Walked to Santiago 3×. A bed for the next one who passes.');

-- ─── Königsweg / Hochkönig (3) ───────────────────────────────
select seed_walker_host('Anneliese Riegler', 'WHO-ANNRI',  47.418, 13.061,  '["bed","food"]'::jsonb,    'Mühlbach · Hochkönig',   'Walked the Königsweg in 2024. Mountain hut + bread + butter.');
select seed_walker_host('Jonas Steinmetz',   'WHO-JONST',  47.631, 13.005,  '["food","water"]'::jsonb,  'Berchtesgaden · BY',     'Local guide. Soup and well-water always available.');
select seed_walker_host('Carolina Wieser',   'WHO-CARWI',  47.554, 12.925,  '["bed"]'::jsonb,           'Watzmann valley · BY',   'One bed in the loft. Bring your own breakfast.');

-- ─── Pfänder / Vorarlberg (3) ────────────────────────────────
select seed_walker_host('Stefan Brunner',    'WHO-STEBR',  47.510, 9.778,   '["bed","food"]'::jsonb,    'Bregenz · Vorarlberg',   'Walked Pfänderweg countless times. Two beds + dinner.');
select seed_walker_host('Iris Heimgartner',  'WHO-IRIHE',  47.503, 9.749,   '["water","food"]'::jsonb,  'Bregenz · Vorarlberg',   'Tea, water, advice on the trails. No beds.');
select seed_walker_host('Daniel Furtschegger','WHO-DANFU', 47.541, 9.680,   '["bed"]'::jsonb,           'Lindau · BY',            'Bed by the lake. Good for tired feet.');

-- ─── Schwarzwald + Bodensee (3) ──────────────────────────────
select seed_walker_host('Theresa Heim',      'WHO-THEHM',  47.995, 7.853,   '["bed","food","water"]'::jsonb, 'Freiburg · BW',    'Cyclist + walker. Three beds + sauerteig bread.');
select seed_walker_host('Markus Eberhardt',  'WHO-MAREB',  47.908, 8.108,   '["bed","food"]'::jsonb,    'Hinterzarten · BW',      'Black Forest grew me up. Cabin with stove + bed.');
select seed_walker_host('Sebastian Vogt',    'WHO-SEBVO',  47.663, 9.176,   '["food","water"]'::jsonb,  'Konstanz · BW',          'Walking Bodensee-Rundweg. Coffee + filling water.');

-- ─── Wandering / between regions (3) ─────────────────────────
select seed_walker_host('Eline van Dijk',    'WHO-ELIVD',  47.300, 11.400,  '["bed","food"]'::jsonb,    'Innsbruck · Tirol',      'Currently walking the Adlerweg. Hut in Tirol, bed + food.');
select seed_walker_host('Friedrich Albers',  'WHO-FRIAL',  48.137, 11.575,  '["water"]'::jsonb,         'München · BY',           'Way-stop on the way south. Just water + a chair.');
select seed_walker_host('Greta Lindqvist',   'WHO-GRELI',  47.073, 15.439,  '["bed","food","water"]'::jsonb, 'Graz · Steiermark', 'Walking the Mariazeller-Weg. Door open in Graz.');

-- ─── Verify
select count(*) as seeded_walker_hosts from profiles where wanderkind_id like 'WHO-%' and is_demo = true;

