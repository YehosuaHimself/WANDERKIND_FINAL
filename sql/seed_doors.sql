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
