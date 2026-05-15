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
