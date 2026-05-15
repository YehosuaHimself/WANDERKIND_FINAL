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
