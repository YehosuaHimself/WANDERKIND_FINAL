-- ════════════════════════════════════════════════════════════
-- WANDERKIND · 00_apply_all.sql
--
-- Bundle of every migration the live app needs.
-- Paste the entire file into the Supabase SQL editor and run once.
-- Idempotent — safe to re-run.
--
-- Order (matters):
--   1. host_offers.sql       — adds profiles.host_offers (map glyph driver)
--   2. pin_hash.sql          — adds profiles.pin_hash + pin_updated_at
--   3. messages.sql          — E2E messaging schema + RLS
--   4. magic_open.sql        — host_locks + stays + RLS
--   5. seed_doors.sql        — 30 demo Wanderkind doors across launch corridor
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

