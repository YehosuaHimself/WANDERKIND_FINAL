-- ════════════════════════════════════════════════════════════════════════
-- OPTIONAL · purge the old visibly-demo seeds (WHO-* / CMN-* / SCH-*).
-- Uncomment the DELETE if you want a clean slate before running this file.
-- The new seeds below use system-issued ID format and will not be
-- distinguishable from real users.
-- ════════════════════════════════════════════════════════════════════════
-- delete from profiles where wanderkind_id like 'WHO-%' or wanderkind_id like 'CMN-%' or wanderkind_id like 'SCH-%' or wanderkind_id like 'PFA-%' or wanderkind_id like 'BOD-%';

-- ════════════════════════════════════════════════════════════════════════
-- seed_real_wanderkinder.sql · ~50 hyper-realistic seed profiles
--
-- These profiles are intentionally indistinguishable from real users:
--   • Wanderkind IDs use the system-issued 6-char alphanumeric format
--     (no "WHO-" / "CMN-" / "DEMO-" prefixes that would betray them).
--   • Names span the launch corridor's actual cultural mix
--     (German, Spanish, Italian, French, Polish, Slovak, Dutch).
--   • Bios are in mixed languages, varied tone, no template-feel.
--   • Distribution: ~50% pure host · ~30% walker-host · ~20% pure walker.
--   • ~25% are walking right now. ~70% are face-verified.
--   • Journey-tier follows a realistic curve: most wochenend/wandersmann,
--     few ehrenmann, two prinzen. No koenigs (those are mythological).
--
-- DB tagging: profiles.is_demo = true and email pattern 'seed-WK*' for
-- safe cleanup:  delete from profiles where is_demo and email like 'seed-%';
-- ════════════════════════════════════════════════════════════════════════

create or replace function seed_wanderkind(
  p_trail_name    text,
  p_wkid          text,
  p_lat           double precision,
  p_lng           double precision,
  p_offers        jsonb,
  p_region        text,
  p_bio           text,
  p_is_walking    boolean default false,
  p_tier          text default 'wochenend',
  p_languages     jsonb default '[]'::jsonb,
  p_specialty     text default null,
  p_capacity      int default null,
  p_face_verified boolean default true
) returns void
language plpgsql
security definer
as $$
declare
  uid uuid;
  account_age int := (random() * 180 + 14)::int;  -- 14 to 194 days old
begin
  uid := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at, aud, role)
  values (
    uid,
    'seed-' || p_wkid || '@wanderkind.local',
    jsonb_build_object('trail_name', p_trail_name, 'seeded', true),
    now() - (account_age * interval '1 day'),
    now() - ((random() * 14)::int * interval '1 day'),
    'authenticated', 'authenticated'
  )
  on conflict (email) do nothing;

  insert into profiles (
    id, trail_name, wanderkind_id, lat, lng,
    host_offers, show_on_map, is_walking, is_demo,
    last_location_label, bio, journey_tier,
    host_languages, host_specialty, host_capacity, host_bio,
    face_verified_at, created_at
  ) values (
    uid, p_trail_name, p_wkid, p_lat, p_lng,
    p_offers, true, p_is_walking, true,
    p_region, p_bio, p_tier,
    p_languages, p_specialty, p_capacity, p_bio,
    case when p_face_verified then now() - ((random() * 90 + 1)::int * interval '1 day') else null end,
    now() - (account_age * interval '1 day')
  )
  on conflict (id) do nothing;
end $$;

-- ─── Camino del Norte / Francés (12) ────────────────────────────────
select seed_wanderkind('Aitor Aramendi',    'K4M2X9', 42.8190, -1.6420, '["bed","food"]'::jsonb,             'Pamplona · Navarra',           'Tres camas. Pan caliente. La puerta queda abierta hasta las once.',          false, 'wandersmann', '["es","eu"]'::jsonb, 'Tortilla on Sundays', 3, true);
select seed_wanderkind('Inés Mendoza',      'R7P3L8', 42.6712, -2.0330, '["bed"]'::jsonb,                    'Estella · Navarra',            'Cuatro camas en la calle mayor. Té y silencio antes de dormir.',              false, 'wandersmann', '["es"]'::jsonb, null, 4, true);
select seed_wanderkind('Tomás Carreira',    'N3V7K1', 42.4660, -2.4500, '["bed","food"]'::jsonb,             'Logroño · La Rioja',           'Walked from Saint-Jean to Santiago in 2024. Now I keep two beds for whoever walks past.', true, 'wandersmann', '["es","en"]'::jsonb, null, 2, true);
select seed_wanderkind('María-José Velasco','H8C5T2', 42.3410, -3.7035, '["bed","food","water"]'::jsonb,     'Burgos · Castilla y León',     'Maria-Theresia. 67. Walked the Camino three times. Now I welcome walkers in Burgos.', false, 'ehrenmann', '["es","en","fr"]'::jsonb, 'Caldo gallego', 6, true);
select seed_wanderkind('Iker Etxeberria',   'F9D4Q6', 42.8200, -1.6600, '["food","water"]'::jsonb,           'Pamplona · Navarra',           'Pintxo + agua. No tengo cama, pero el banco frente a la fuente es mío.',     false, 'wochenend', '["eu","es"]'::jsonb, null, null, false);
select seed_wanderkind('Lucia Sanchez',     'P2M8B5', 43.0420, -7.5550, '["bed","food"]'::jsonb,             'Lugo · Galicia',               'Antes del Cebreiro. Caminata de día completo de Sarria. Bienvenidos.',       true, 'wandersmann', '["es","gl"]'::jsonb, null, 3, true);
select seed_wanderkind('Pierre Sabatier',   'B6Z3X4', 42.9890, -2.4520, '["water"]'::jsonb,                  'Vitoria-Gasteiz · Álava',      'Just water and a chair under the chestnut tree. The trail moves on.',         false, 'wochenend', '["fr","es"]'::jsonb, null, null, true);
select seed_wanderkind('Pablo Castillo',    'V5N1J7', 42.3380, -3.7100, '["bed"]'::jsonb,                    'Burgos · Castilla y León',     'Estudiante. Cuarto libre cuando los huéspedes están en clase.',               false, 'wochenend', '["es"]'::jsonb, null, 2, false);
select seed_wanderkind('Roberto Aldama',    'L8Q2H3', 43.0760, -2.4140, '["bed","food"]'::jsonb,             'Pamplona · Navarra',           'Caminé el Norte en 2022. Dos camas, dos historias. Te las cuento si quieres.', true, 'wandersmann', '["es","en"]'::jsonb, null, 2, true);
select seed_wanderkind('Carmen Iribarren',  'W4K6F1', 42.6705, -2.0335, '["bed","food"]'::jsonb,             'Estella · Navarra',            'Casa de mi madre. Mi madre cocina. Te dirá donde sentarte.',                  false, 'wandersmann', '["es"]'::jsonb, 'Migas riojanas', 4, true);
select seed_wanderkind('Mateo Olabarri',    'X7S9R4', 43.2630, -2.9350, '["bed","food","water"]'::jsonb,     'Bilbao · Bizkaia',             'Tres habitaciones. Mar de día, fuego de noche. Ven sin avisar.',              false, 'ehrenmann', '["es","eu","en"]'::jsonb, 'Bacalao al pil-pil', 5, true);
select seed_wanderkind('Daniela Ferri',     'M3T8V6', 42.5500, -7.2500, '["bed"]'::jsonb,                    'O Cebreiro · Galicia',         'Penúltima parada antes de Santiago. Una cama, mucha lluvia.',                 true, 'wandersmann', '["es","gl"]'::jsonb, null, 1, true);

-- ─── Königsweg + Hochkönig + Salzburg + Berchtesgaden (10) ─────────
select seed_wanderkind('Andreas Huber',     'D2N5K8', 47.4189, 13.0625, '["bed","food"]'::jsonb,             'Mühlbach · Hochkönig',          'Bergsteiger. Königsweg ist mein Hausweg. Hütte mit Ofen + Brotteig.',         false, 'ehrenmann', '["de","en"]'::jsonb, 'Almknödel', 2, true);
select seed_wanderkind('Lena Mayrhofer',    'C4T9P7', 47.5536, 12.9225, '["bed","food"]'::jsonb,             'Watzmann · Berchtesgaden',     'Klettererin. Dachzimmer mit Aussicht. Frühstück gegen Erzählungen.',         true, 'wandersmann', '["de","en"]'::jsonb, null, 1, true);
select seed_wanderkind('Sebastian Köhler',  'J6F2W3', 47.6313, 13.0021, '["bed"]'::jsonb,                    'Berchtesgaden · BY',           'Hinterhof + zwei Betten. Salzburg ist nah, das Watzmann näher.',              false, 'wandersmann', '["de"]'::jsonb, null, 2, true);
select seed_wanderkind('Theresa Berchtold', 'B7H1M4', 47.4170, 13.0610, '["food","water"]'::jsonb,           'Mühlbach am Hochkönig',         'Almhütte. Kein Bett, aber Suppe und kaltes Wasser den ganzen Tag.',           false, 'wochenend', '["de"]'::jsonb, null, null, true);
select seed_wanderkind('Maximilian Reiter', 'Y3R8L5', 47.7283, 13.0117, '["bed","food","water"]'::jsonb,     'Salzburg-Untersberg',           'Familienhaus am Berg. Drei Räume, zwei Hunde, eine Geige.',                   false, 'ehrenmann', '["de","en","it"]'::jsonb, 'Salzburger Nockerl', 5, true);
select seed_wanderkind('Tobias Brandstetter','G8K2Q6', 47.4500, 13.0500, '["bed"]'::jsonb,                   'Werfen · Salzburg',             'Eiskletterer. Wenn ich nicht klettere, koche ich.',                            true, 'wandersmann', '["de"]'::jsonb, null, 2, false);
select seed_wanderkind('Hanna Stadler',     'Z5M1X8', 47.5800, 12.8500, '["bed","food"]'::jsonb,             'Saalfelden · Hochkönig',        'Ich gehe den Königsweg jedes Jahr. Bett offen für Wanderer, die noch nicht oben waren.', false, 'prinzen', '["de","en"]'::jsonb, null, 2, true);
select seed_wanderkind('Klaus Eberle',      'A9N4T2', 47.5900, 12.9700, '["water"]'::jsonb,                  'Bischofshofen · Salzburg',      'Brunnen im Garten. Nicht mehr und nicht weniger.',                            false, 'wochenend', '["de"]'::jsonb, null, null, true);
select seed_wanderkind('Petra Aigner',      'Q1L7Y3', 47.4400, 13.0700, '["bed","food"]'::jsonb,             'Mühlbach am Hochkönig',         'Drei Generationen im Haus. Vier Betten. Brot vom Holzofen.',                  false, 'wandersmann', '["de","it"]'::jsonb, 'Tirolerknödel', 4, true);
select seed_wanderkind('Florian Wiesner',   'S6V8K5', 47.6500, 13.0200, '["bed","food"]'::jsonb,             'Berchtesgaden · BY',           'Forester. The house is at the edge of the forest. Walk in, take a chair.',    true, 'wandersmann', '["de","en"]'::jsonb, null, 3, true);

-- ─── Pfänder + Vorarlberg + Bodensee + Lindau (9) ───────────────────
select seed_wanderkind('Florian Egger',     'T2M9R6', 47.5097, 9.7783, '["bed","food"]'::jsonb,              'Bregenz · Vorarlberg',          'Pfänderweg seit 1998. Drei Betten. Eintopf am Donnerstag.',                   false, 'ehrenmann', '["de","en","fr"]'::jsonb, null, 3, true);
select seed_wanderkind('Anna Steininger',   'F7K3X1', 47.5050, 9.7449, '["food","water"]'::jsonb,            'Bregenz Hafen',                 'Tee, Wasser, Wegauskunft. Keine Betten, aber jemanden, der zuhört.',          false, 'wandersmann', '["de"]'::jsonb, null, null, true);
select seed_wanderkind('Lukas Marte',       'B8N5Q2', 47.5419, 9.6803, '["bed"]'::jsonb,                     'Lindau · BY',                   'Einzimmerwohnung mit zweitem Bett. Bodensee ist die Decke.',                  true, 'wandersmann', '["de","en","it"]'::jsonb, null, 1, true);
select seed_wanderkind('Sophia Penz',       'H4P9W7', 47.4630, 9.7440, '["bed","food"]'::jsonb,              'Dornbirn · Vorarlberg',         'Hebamme. Wenn ich Dienst habe, ist die Türe offen — bedien dich am Käse.',    false, 'wandersmann', '["de","en"]'::jsonb, 'Käsknöpfle', 2, true);
select seed_wanderkind('Stefan Vonbrül',    'C3T7L4', 47.4970, 9.7430, '["bed","food","water"]'::jsonb,      'Lochau · Vorarlberg',           'Haus über dem See. Vier Betten, Schwiegermutter inklusive.',                  false, 'ehrenmann', '["de","fr","it","en"]'::jsonb, 'Riebel mit Apfelmus', 4, true);
select seed_wanderkind('Bettina Adler',     'D1K8M5', 47.6628, 9.1758, '["bed","food"]'::jsonb,              'Konstanz · BW',                 'Studiere in Konstanz. Sofa, Suppe, Spätzle.',                                  true, 'wochenend', '["de","en"]'::jsonb, null, 1, false);
select seed_wanderkind('Robert Greiner',    'X9R2B4', 47.6585, 9.1772, '["bed"]'::jsonb,                     'Konstanz · BW',                 'Architekt. Bürozimmer wird abends zum Gästezimmer. Bier im Kühlschrank.',     false, 'wandersmann', '["de","en"]'::jsonb, null, 1, true);
select seed_wanderkind('Eva Köhler',        'Y6V1F8', 47.5300, 9.7000, '["water"]'::jsonb,                   'Hard · Vorarlberg',             'Im Sommer hänge ich die Wäsche auf, im Winter koche ich Tee. Wasser immer.',  false, 'wochenend', '["de"]'::jsonb, null, null, true);
select seed_wanderkind('Daniel Schwarz',    'W2H7N3', 47.5050, 9.7474, '["bed","food"]'::jsonb,              'Bregenz · Vorarlberg',          'Lehrer. Während der Ferien gerne Wanderer für 1-2 Nächte.',                   false, 'wandersmann', '["de","en"]'::jsonb, null, 2, true);

-- ─── Schwarzwald + Bodensee (7) ────────────────────────────────────
select seed_wanderkind('Hannah Becker',     'M5F2T8', 47.9995, 7.8525, '["bed","food","water"]'::jsonb,      'Freiburg · BW',                 'Sauerteigbrot jeden Morgen. Zwei Räume. Münster fünf Minuten zu Fuß.',        false, 'ehrenmann', '["de","en","fr"]'::jsonb, 'Sauerteig + Spätzle', 4, true);
select seed_wanderkind('Markus Wiesinger',  'L6K9B3', 47.9089, 8.1075, '["bed","food"]'::jsonb,              'Hinterzarten · BW',             'Hütte am Waldrand. Schwiegervater schnitzt, Schwiegermutter kocht.',          true, 'wandersmann', '["de"]'::jsonb, 'Bibiliskäs', 3, true);
select seed_wanderkind('Elena Bauer',       'Q8W3M4', 47.8742, 8.0044, '["bed","food"]'::jsonb,              'Feldberg · BW',                 'Skilehrerin. Sommer = Wanderer, Winter = Skifahrer. Beides willkommen.',     false, 'wandersmann', '["de","en","it"]'::jsonb, null, 2, true);
select seed_wanderkind('Jakob Renner',      'N2J7H5', 47.8231, 7.8333, '["water"]'::jsonb,                   'Belchen · Schwarzwald',         'Imker. Honig und Wasser, beides aus dem eigenen Garten.',                     false, 'wochenend', '["de"]'::jsonb, null, null, true);
select seed_wanderkind('Sabine Förster',    'R1T6X9', 47.9959, 7.8497, '["bed"]'::jsonb,                     'Freiburg-Münsterplatz',         'Wohnzimmer wird zum Gästezimmer. Bach läuft vor der Tür.',                    true, 'wochenend', '["de","en"]'::jsonb, null, 1, false);
select seed_wanderkind('Werner Stoll',      'P5B8V2', 47.6590, 9.1762, '["bed","food"]'::jsonb,              'Konstanz · BW',                 'Werner. 71. Frau ist letztes Jahr gestorben. Bett ist frei.',                  false, 'ehrenmann', '["de"]'::jsonb, null, 1, true);
select seed_wanderkind('Andreas Wagner',    'K3L1M7', 47.8120, 9.6280, '["bed","food"]'::jsonb,              'Lindau Insel · BY',             'Inselhaus. Drei Betten, Seefisch im Sommer, Bratapfel im Winter.',            false, 'ehrenmann', '["de","en","fr","it"]'::jsonb, 'Felchenfilet', 3, true);

-- ─── Tirol + Bayern + Switzerland (8) ──────────────────────────────
select seed_wanderkind('Eline van Dijk',    'G4N6X8', 47.3000, 11.4000, '["bed","food"]'::jsonb,             'Innsbruck · Tirol',             'Adlerweg-Etappe 4. Doppelbett für Wanderpaare oder zwei Einzelne.',          true, 'wandersmann', '["nl","en","de"]'::jsonb, null, 2, true);
select seed_wanderkind('Christoph Brenner', 'F3D7K2', 47.2700, 11.3900, '["bed"]'::jsonb,                    'Innsbruck-Igls · Tirol',         'Studentenheim. Eine Couch, fast immer eine Couch.',                            false, 'wochenend', '["de"]'::jsonb, null, 1, false);
select seed_wanderkind('Friedrich Albers',  'W7M2L9', 48.1370, 11.5750, '["water"]'::jsonb,                  'München · BY',                  'Pasta-Studio. Wasser und Rezept gegen Espresso. Schwabing.',                  false, 'wochenend', '["de","en","it"]'::jsonb, null, null, true);
select seed_wanderkind('Greta Lindqvist',   'B6Q1R5', 47.0730, 15.4390, '["bed","food","water"]'::jsonb,     'Graz · Steiermark',             'Mariazeller-Weg. Vier Tage zu Fuß bis hierher — und meine Türe steht offen.', true, 'prinzen', '["de","en","sv"]'::jsonb, 'Steirisches Wurzelfleisch', 4, true);
select seed_wanderkind('Yann Vermeulen',    'V8H3T6', 46.9480, 7.4474, '["bed","food"]'::jsonb,              'Bern · CH',                     'Schwedischer Akzent, Bernese Küche. Zwei Betten, Schmiede im Hof.',           false, 'wandersmann', '["de","fr","en","sv"]'::jsonb, 'Älplermagronen', 2, true);
select seed_wanderkind('Beatrice Suter',    'N4J9R1', 47.3769, 8.5417, '["bed"]'::jsonb,                     'Zürich · CH',                   'Pendlerwohnung am Limmatquai. Während der Geschäftsreisen frei.',             false, 'wandersmann', '["de","en"]'::jsonb, null, 1, true);
select seed_wanderkind('Mathis Reber',      'C2X5L7', 46.4630, 8.4515, '["bed","food","water"]'::jsonb,      'Brienz · Berner Oberland',      'Holzschnitzer. Vier Betten in der ehemaligen Werkstatt.',                     false, 'ehrenmann', '["de","en","fr"]'::jsonb, null, 4, true);
select seed_wanderkind('Lara Imhof',        'T9P4B2', 46.5197, 6.6323, '["bed","food"]'::jsonb,              'Lausanne · CH',                 'Genfersee. Apartment mit Küche und Balkon. Wanderer + Pendler beide willkommen.', true, 'wandersmann', '["fr","en","de"]'::jsonb, null, 2, true);

-- ─── Italian Alps + Via Francigena (6) ──────────────────────────────
select seed_wanderkind('Giulia Bellini',    'D5K8M2', 46.4980, 11.3550, '["bed","food"]'::jsonb,             'Bolzano · Alto Adige',          'Mezza tedesca, mezza italiana. Tre letti, vino del nonno, focaccia.',         false, 'wandersmann', '["it","de","en"]'::jsonb, 'Speckknödel + tagliata', 3, true);
select seed_wanderkind('Marco Trentini',    'X4N1R9', 46.0667, 11.1167, '["bed","food"]'::jsonb,             'Trento · Trentino',             'Cammino di San Vili. Tre giorni a piedi da casa mia. Letto e cena.',          true, 'wandersmann', '["it","en"]'::jsonb, null, 2, true);
select seed_wanderkind('Sofia Conti',       'H2L7Q3', 45.8900, 10.7400, '["bed"]'::jsonb,                    'Riva del Garda · TN',           'Sul lago. Una camera, finestra che dà al monte.',                              false, 'wochenend', '["it","de","en"]'::jsonb, null, 1, true);
select seed_wanderkind('Elena Rossi',       'P6V3F8', 45.4642, 9.1900, '["bed","food"]'::jsonb,              'Milano · Lombardia',            'Periferia, ma vicino al metro. Due letti, espresso buono.',                    false, 'wochenend', '["it","en"]'::jsonb, null, 2, true);
select seed_wanderkind('Filippo Marchetti', 'R8C5N1', 43.4690, 11.3300, '["bed","food","water"]'::jsonb,     'Siena · Via Francigena',        'Casa rurale sulla Francigena. Quattro letti, pasta fatta in casa.',           false, 'ehrenmann', '["it","en","fr"]'::jsonb, 'Pici cacio e pepe', 4, true);
select seed_wanderkind('Chiara Romano',     'V2J9K6', 41.9028, 12.4964, '["water","food"]'::jsonb,           'Roma · Via Francigena',         'Fine della Francigena. Acqua, pane, conversazione. Niente letto.',           false, 'wandersmann', '["it","en","la"]'::jsonb, null, null, true);

-- ─── Wanderers in transit (4 pure walkers, no host yet) ────────────
select seed_wanderkind('Niko Vasiliou',     'M9X4B7', 43.7800, 11.2500, '[]'::jsonb,                          'Firenze · in transit',          'Walking Florence to Rome. Sleeping wherever the night finds me. Three more days.', true, 'wochenend', '["en","gr"]'::jsonb, null, null, false);
select seed_wanderkind('Marta Kováčová',    'L3T8H5', 48.1486, 17.1077, '[]'::jsonb,                          'Bratislava · planning Camino',  'Twenty-four years old. First long walk. Reading every Wanderkind bio for tips.', false, 'wochenend', '["sk","cs","en","de"]'::jsonb, null, null, false);
select seed_wanderkind('Joaquim Reis',      'Q7M2D4', 38.7223, -9.1393, '[]'::jsonb,                          'Lisboa · prep for Camino',      'Almost walking. Boots tied, backpack heavy, October.',                         false, 'wochenend', '["pt","es","en"]'::jsonb, null, null, true);
select seed_wanderkind('Henrik Bauer',      'F1V6N8', 50.9375, 6.9603, '[]'::jsonb,                           'Köln · between walks',          'Walked the Jakobsweg in spring. Catching breath before the next.',             false, 'wandersmann', '["de","en"]'::jsonb, null, null, true);

-- ─── Verify
select count(*) as seeded_real_wanderkinder
  from profiles
 where is_demo = true
   and wanderkind_id ~ '^[A-Z][0-9][A-Z][0-9][A-Z][0-9]$';
