-- ============================================================================
-- face_image.sql · separate ID photo from bio image
-- ============================================================================
-- The onboarding wizard collects a biometric-grade photo for the ID. This
-- column stores it independently from any bio/profile imagery.
-- ============================================================================

alter table profiles
  add column if not exists face_image_url text;

comment on column profiles.face_image_url is
  'Biometric-grade ID photo (separate from bio image). Validated against ICAO-9303-like rules: single frontal face, neutral, eyes open, plain background. Phase-2: MediaPipe Face Detection enforces.';
