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
