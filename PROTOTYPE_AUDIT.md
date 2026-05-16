# Wanderkind · Prototype → Implementation Audit
**Source:** `wanderkind-prototype_design_implementation.html` (the file with the ADOPT / REFINE / MERGE / SKIP badges per screen)
**Date:** May 2026
**Headline tally (per the file):** 9 ADOPT · 7 REFINE · 5 MERGE · 1 SKIP = 22 screens

This audit walks each screen, restates the initial plan, records the current status in the live repo, and identifies remaining gaps. Then we fill the gaps step by step.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Plan fully shipped, no gap |
| ◐ | Partial — plan shipped but with known refinements due |
| ⚠ | Plan partially shipped, real gaps |
| ✗ | Not shipped |
| ↻ | Superseded by a later decision (workshop, user instruction, etc.) |

---

## The 22 screens

### 01 · Stamps · Home → `/stamps.html` · **REFINE** · Status: **◐**

**Initial plan.** Adopt chip filter (`ALL · CITIES · CHURCHES · CLUBS · OTHER`), three tier styles, share pill, "14/∞" counter, locked future-stamp. Categories renamed to `CHURCHES · MOUNTAINS · FESTIVALS · OTHER`. Year-grouping headers + search input. PROPOSE tile links to /propose.html.

**Current status.** Chip filter shipped. Year-grouping shipped. Search shipped. Tier ring CSS shipped. **PROPOSE tile removed** (Propose feature deleted by user instruction).

**Gap.** None significant. The "14/∞" counter is missing — minor. The future-locked stamp placeholder is missing.

**Next action.** Add total-stamps counter + locked-future-stamp placeholder card.

---

### 02 · Passport · Credential → `/id.html` · **MERGE** · Status: ✅

**Initial plan.** We had already shipped a richer version (PIN gate, two-page slider, Covenant, Cryptographic Security Matrix). Adopt polish only: guilloché etching, diagonal "WANDERKIND · INC" watermark at -28° / 3% opacity, microtext line above MRZ.

**Current status.** Page 3 added with QR verifier + guilloché etching + diagonal watermark + microtext + scan-hint chip. All polish landed.

**Gap.** None.

---

### 03 · Stamp · Gallery → new `/stamp.html?id=<id>` · **ADOPT** · Status: ✅

**Initial plan.** Each stamp opens into a page with photos and a private note. Numeric "03" ghosted in the corner.

**Current status.** `/stamp.html` page shipped with `?id=` and `?proposal=` query support.

**Gap.** Likely needs the "private note" field surfaced (host_reply column on stamps).

**Next action.** Verify stamp.html shows both the walker's vouch and the host's reply.

---

### 04 · Hosts · Offer a roof → `/host.html` · **REFINE** · Status: ✅

**Initial plan.** Add the five-tier shelter ladder (Garden / Simple Roof / Couch / Room (no bed) / Room with bed). "Accepting · Snooze 24H" chip, "Donation-based" toggle, "Arrival before 22:00" toggle.

**Current status.** Five-tier shelter ladder shipped in the host setup wizard. Donation toggle shipped. Snooze 24h shipped (on /me.html).

**Gap.** "Arrival before 22:00" toggle was specified but not yet surfaced in the host setup.

**Next action.** Add arrival cutoff toggle to /host.html.

---

### 05 · Messages → `/messages.html` · **MERGE** · Status: ✅

**Initial plan.** Already shipped; adopt prototype's amber-glowing-dot for unread (not a number), timestamp format `09:12 / YEST / 13·IV`.

**Current status.** Both shipped (commits fb8ed04 + f003d12).

**Gap.** None.

---

### 06 · Wanderkinder Nearby → `/map.html` · **REFINE** · Status: ◐

**Initial plan.** Adopt the bottom drawer interaction (replace Leaflet popups). Visible/Invisible toggle. Push notifications when a Wanderkind arrives near a host's home.

**Current status.** Bottom drawer shipped (`/js/map-boot.js` openDrawer). Visible/Invisible toggle implied via show_on_map. Map landmarks (Churches/Mountains/Festivals) made permanent + secondary POIs + foldable legend + 15 walker-hosts seeded.

**Gap.** Push notifications for proximity to host are NOT shipped — and arguably **canonically forbidden** (Canon: no notifications that pull the user back). This needs a board call: refuse, or design a one-time on-arrival prompt.

**Next action.** Hold a quick board call on proximity notifications — likely refuse per Canon.

---

### 07 · Feed · Witnessing → new `/feed.html` · **ADOPT** → ↻ **superseded by WanderWall** · Status: ✅ (the supersession is the implementation)

**Initial plan.** Two content types (sealed stamps, posts from road), no comments, no likes counter, heart + share only.

**Current status.** Workshop convened (`/wanderkind-feed-workshop.html`), brief published (`FEED_BRIEF.md`), `/feed.html` retired, replaced by **The WanderWall** drawer on `/map.html`. Six refusals locked in (no notifications, no infinite scroll, no reactions, no recommender, etc.).

**Gap.** WanderWall has a schema bug discovered in the v2 audit: the stamps query references columns that don't exist (`name`, `tier`, `lat`, `lng` — should be `region_label` + join with host profile for geo). The wanderwall.js v2 draft sits in `/tmp` but wasn't pushed because the visible UX bugs took priority.

**Next action.** Push the v2 wanderwall.js with corrected queries + collapse stamp+vouch to one card per event.

---

### 08 · Magic Open · Keyless arrival → `/hosts.html` · **MERGE** · Status: ✅

**Initial plan.** Already shipped. Polish only: 4-digit code, time-boxed, share through Inbox, works with Nuki/August/Yale/TTLock.

**Current status.** Magic Open with pass-key share shipped. Closing time "18:00 → 10:00" shipped on the pill.

**Gap.** Smart-lock hardware integration (Nuki/August/Yale/TTLock) is NOT shipped — but this is hardware-side work outside the PWA. Probably Phase-2.

**Next action.** Defer to Phase 2 (lock integration is OEM work, not PPWA work).

---

### 09 · Light Mode → — · **SKIP** · Status: ✅

**Initial plan.** Skip entirely. Cream is the only mode.

**Current status.** Skipped correctly. No dark mode.

**Gap.** None.

---

### 10 · Propose · New stamp → new `/propose.html` · **ADOPT** → ↻ **removed by user instruction** · Status: ✅

**Initial plan.** Three-tier propose-a-stamp page with coord-locked geo, photos, real-time tier progress.

**Current status.** Built, then **deleted** ("Propose is to be removed from the app as section and functionality"). The orphan CSS on /stamps.html was also stripped.

**Gap.** None — full removal honored.

---

### Legend · Three tiers → inline help on /stamps.html · **ADOPT** · Status: ⚠

**Initial plan.** Inline help in two places: stamps page and propose page.

**Current status.** Tier ring CSS shipped on stamps page. **Inline help legend** explaining the three tier rings (solid / corner dot / dashed) is NOT shipped.

**Next action.** Add the three-tier legend as a small explainer on /stamps.html (maybe in an info popover or under the page header).

---

### 11 · Verification · Phase 1 → background from /propose.html · **ADOPT** → re-anchor needed · Status: ⚠

**Initial plan.** Five-layer verification (platform attestation, sensor fusion, dwell+trajectory, coordinate geometry, network sanity) — runs as background process invoked when sealing a proposal.

**Current status.** Propose is removed, so the original anchor is gone. Face verification (EPIC 11) has shipped its own flow (`/verify-me.html` + heuristic liveness + verify_face RPC). That's a different verification — identity, not coordinate-anti-spoof.

**Gap.** The coordinate/anti-spoof verification has no home. Without Propose, the only place stamps get sealed is via the `publish_vouches` RPC (after a real stay). Which is itself a strong verification signal (two parties locked drafts independently). Possibly the original Phase-1 verification is no longer needed.

**Next action.** Confirm with you: is coordinate-anti-spoof verification still needed now that stamps only come from completed stays? My read: **no — the stay itself is the proof.** If confirmed, mark as ↻ superseded.

---

### Artisanal · No two alike → /stamps.html stamp rendering · **ADOPT (polish)** · Status: ⚠

**Initial plan.** Each stamp visually unique — small typographic, color, ornament variations.

**Current status.** Stamps render with tier ring + name + region. No per-stamp visual uniqueness yet.

**Next action.** Add a deterministic visual signature per stamp (seeded from `stamps.id` or `die_seed`) — small rotation, ornament, color shift — so no two stamps look identical.

---

### P1 · Bio Page → /id.html Page 1 · **MERGE (polish)** · Status: ✅

**Initial plan.** Polish details only. Skip "Kingdom of God" + diplomatic-passport framing — use Covenant instead.

**Current status.** Shipped. Covenant articles in place.

**Gap.** None.

---

### P1b · Back page · QR verifier → /id.html Page 3 · **ADOPT** · Status: ✅

**Initial plan.** New Page 3 with QR verifier. Three dots. Simple Mode hides Page 2 AND Page 3.

**Current status.** Page 3 shipped with QR + scanner-overlay.

**Gap.** Simple-Mode behavior on /id.html: verify it correctly hides Page 2 + 3.

**Next action.** Test Simple Mode on /id.html with a screen reader and a Simple Mode-on session.

---

### P1c · Public verifier → /verify/<wkid> · **ADOPT** · Status: ✅

**Initial plan.** Public landing where a QR scan lands. No app required. Five languages. ID-3 ratio. Available to border officers in 15 sec.

**Current status.** `/verify/index.html` shipped (commit b6b73b8).

**Gap.** Multi-language support (only English shipped). The 5-language commitment is open.

**Next action.** Add language switcher (DE/EN/ES/IT/FR) for /verify/index.html. Defer if other priorities outrank.

---

### P2 · Digital Security Matrix → /id.html Page 2 · **MERGE (polish)** · Status: ✅

**Initial plan.** Already shipped. Polish only: Wanderkind Covenant Articles I–IV (no VCDR reference).

**Current status.** Shipped.

**Gap.** None.

---

### P3 · MRZ Vertical → /id.html scanner mode · **ADOPT (polish)** · Status: ✅

**Initial plan.** DeviceOrientation API · landscape mode shows MRZ rotated 90° full-screen. Hint chip "Turn the phone sideways to scan."

**Current status.** Shipped (`/js/scanner-mode.js` listening for matchMedia landscape orientation).

**Gap.** None — implemented per the user's explicit clarification.

---

### W1 · Way Discovery → /way.html · **ADOPT** · Status: ◐

**Initial plan.** Four Ways carded (Camino Frances, Via Francigena, Königsweg, Shikoku) + "Or simply walk" bottom card.

**Current status.** Routes shipped (King's Way, Camino, Via Francigena, Königsweg, Shikoku, Appalachian).

**Gap.** Route detail subpages (elevation profile, Download for Offline button) per the user's later prototype screens — not shipped.

**Next action.** Build `/way.html?route=konigsweg` detail subpage with elevation SVG + offline tile prefetch. Lower priority than other gaps.

---

### FP · Food Pass → /passes.html unfold · **REFINE** · Status: ✅

**Initial plan.** Major upgrade for Food Pass unfold (aurora, scan line, particles, days counter, "To the house" letter).

**Current status.** Shipped (Phase 2 master pass).

**Gap.** None significant.

---

### PF · Profile · Host toggle → /me.html · **REFINE** · Status: ✅

**Initial plan.** 7-image grid + host toggle + journey-tier bar.

**Current status.** Shipped (Phase 5 master pass).

**Gap.** Door-key issued pill + Get Verified banner (EPIC 11) added.

---

### GW · Group Walk → new /walks.html · **ADOPT** · Status: ✅

**Initial plan.** Three moods (walking / rest / gathering). 48h auto-dissolve. Within-5km join. Members' live dots.

**Current status.** Shipped.

**Gap.** None.

---

## Recently added (not in the original 22) — quick status

| Item | Status |
|---|---|
| `/about.html` philosophy page ("Every Wanderkind is a Host") | ✅ shipped |
| `/verify-me.html` mandatory FaceScan (EPIC 11) | ✅ shipped |
| Map · static POIs (wifi/fountain/info/parish) + foldable legend | ✅ shipped |
| 15 walker-host SQL seed | ✅ shipped |
| WanderWall drawer on /map.html | ◐ shipped, but v2 query fix pending |
| First-load left-bound hero (`/install.html`) | ✅ just shipped |
| Logo replacement (canonical W SVG → Helvetica W) | ⚠ in queue (task #84) |
| Typography migration (Courier scope reduction) | ⚠ in queue (task #85) |
| Image clipping fix | ⚠ in queue (task #86) |

---

## The remaining gap list, in order

1. **WanderWall v2 query fix** — push the schema-corrected queries; collapse stamp+vouch to 3 card types.
2. **Stamp #11 verification** — confirm whether coordinate-anti-spoof is still needed after Propose removal.
3. **Inline three-tier legend on /stamps.html** — small explainer for the tier rings.
4. **Arrival-cutoff toggle on /host.html** — "Arrival before 22:00" prompt in setup.
5. **Artisanal stamp rendering** — deterministic per-stamp visual signature.
6. **Stamps "14/∞" counter + locked-future placeholder** — small additions to /stamps.html.
7. **Route detail subpage** — `/way.html?route=…` with elevation profile + Download Offline.
8. **Multi-language /verify/<wkid>** — DE/EN/ES/IT/FR switcher.
9. **Logo replacement** — task #84.
10. **Typography migration** — task #85.
11. **Image clipping fix** — task #86.
12. **Smart-lock OEM integration** — deferred to Phase 2.
13. **Map proximity notifications** — likely refuse per Canon (needs board call).

---

*Next: I work down this list one item at a time, with a small commit per gap, and CI-verify between each.*
