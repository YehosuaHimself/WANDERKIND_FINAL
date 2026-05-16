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
