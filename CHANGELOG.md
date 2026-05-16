# Changelog

All notable changes to Wanderkind.

The format follows [Keep a Changelog](https://keepachangelog.com/) and adheres to
[Semantic Versioning](https://semver.org/) where applicable. Cache versions in
`sw.js` follow their own sequence and are noted per release.

This is a living document. New entries go at the top of `[Unreleased]`. When we
cut a release, the unreleased entries move down under a dated heading.

---

## [Unreleased]

### Added
- **The WanderWall** · pull-up drawer on `/map.html` showing the last 24 hours
  of public events in the current map viewport. Replaces the retired
  `/feed.html`. Six explicit refusals: not a separate page, not a notification
  source, not a scroll surface, not a reaction surface, not a recommender, not
  a stream of every event. See `FEED_BRIEF.md` and `wanderkind-feed-workshop.html`.
- **Streamlined onboarding** at `/onboarding/` · 11-step wizard (welcome →
  email+password → trail name → region → "EVERY WANDERKIND IS ALSO A HOST"
  doctrine → face biometric → unlocked → PIN → ID photo → house setup → map).
- **EPIC 11 · mandatory FaceScan** at `/verify-me.html` · 3-stage heuristic
  liveness; sets `profiles.face_verified_at`. Phase-2 hook for MediaPipe.
- **About page** at `/about.html` · "Every Wanderkind is also a Host" philosophy
  page with the three duties (open the door · share the table · pass the water).
- **Map landmarks always-on** · churches, mountains, festivals render as
  permanent primary icons. Secondary services (wifi, fountain, tourist info,
  parish house) zoom-gated. Foldable legend in lower-right.
- **Hyper-realistic seed** · 56 wanderkinder spread across the launch corridor
  with system-issued-looking IDs and natural-voice bios in 9 languages.
- **Field error reporter** (`/js/error-reporter.js`) · catches every JS error
  and unhandled promise rejection from real users; posts to a Supabase
  `error_reports` table behind RLS. No third-party tracking.
- **Visual + Lighthouse harness** in CI (`scripts/screenshots.mjs`) · runs on
  every push and daily at 06:00 UTC. Produces 21 full-page screenshots at
  iPhone-14-Pro viewport + Lighthouse scores per public page.
- **First-load hero** · LOGO · WANDERKIND · JOIN THE NETWORK · WALK FOREVER
  FREE · EVERY WALK BEGINS AT YOUR DOOR · left-bound (`/install.html`).

### Changed
- **`/more.html` grid** restructured to 5 × 2: ID / Passes · Messages / Stamps ·
  Guest Book / My House · King's Way / Group Walks · About / Settings.
- **Tabbar** now bulletproof-locked: `position: fixed !important` plus a JS
  enforcer that re-pins on load / resize / orientation / pageshow. Honors
  `env(safe-area-inset-bottom)`.
- **FAB hub W square** now truly square (64 × 64, equal sides).
- **Profile + cover images** crop gentler (5/2 ratio, 160-280px height) with
  `object-position` favoring the upper portion where faces sit.
- **Lighthouse gate** tightened: a11y 100 mandatory, SEO 100 mandatory.
- **Pinch-zoom restored** · removed `maximum-scale=1, user-scalable=no` from
  all 30 HTML files. Re-enables zoom for elderly users (the 75-year-old Rosa
  persona) and unlocks the Lighthouse a11y 100 score.

### Removed
- **`/feed.html`** · superseded by The WanderWall drawer on `/map.html`.
- **`/propose.html`** · feature deprecated per user instruction.
- **Churches / Mountains / Festivals filter chips** · these are now permanent
  primary landmarks, not filterable badges.

### Fixed
- Map empty / unresponsive chips · duplicate `POIS` import in `/js/map-boot.js`
  was causing a module SyntaxError that prevented `bootMap()` from running.
- WanderWall couldn't fold back · added scrim (tap-to-close) and a larger ×
  close button (36px circular target).
- Legend couldn't unfold · inline `<script>` was blocked by CSP; toggle wiring
  moved to `map-boot.js`.
- Onboarding step 3 (trail name) skipped on refresh after signup · removed
  broken auto-advance line.
- `/host.html` didn't honor `?next=` · onboarding step 10 → 11 hand-off now
  completes correctly.
- WCAG AA contrast failures on `.map-status`, pressed filter-chip, and
  `.w-route-meta` (was using `--wk-ink-muted` 3.3:1 against cream; switched
  to `--wk-ink-soft` 5.5:1).

---

*Older entries are condensed into the README as build history. From this
point forward the changelog is the source of truth.*
