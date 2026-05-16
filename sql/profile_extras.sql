-- ════════════════════════════════════════════════════════════════════════
-- profile_extras.sql · interests + extended photo gallery
--
-- Two optional additions to /me · /u/<wkid>:
--   1. interests · free-text array of self-described tags (e.g. "techno",
--      "wandering", "religion"). Rendered as pills on the profile.
--   2. photos · jsonb array (already exists) used as a 3×3 gallery, where
--      the first entry is the profile picture and the rest are gallery slots.
--
-- Both are entirely optional. Empty array = no display.
-- ════════════════════════════════════════════════════════════════════════

alter table profiles
  add column if not exists interests jsonb default '[]'::jsonb;

comment on column profiles.interests is
  'Free-text self-described interest tags. JSON array of strings, max ~12 entries. Examples: ["techno","wandering","religion"]. Rendered as pills on /me and /u/<wkid>. Not mandatory; null/empty = no display.';

comment on column profiles.photos is
  'Profile gallery · up to 9 images including the profile pic. JSON array of URLs. photos[0] = profile pic, photos[1..8] = 3×3 gallery slots. Optional but recommended for trust.';
