# The WanderWall — Decision Brief

**Status:** Ruled. May 2026.
**Supersedes:** the v1 Feed in `/feed.html` and `/js/feed.js`.
**Companion artifact:** `/wanderkind-feed-workshop.html` (full workshop transcript, persona voices, board synthesis).

## What was decided

The product surface formerly called the **Feed** is renamed **The WanderWall** and re-shaped to obey the Doctrine and the Canon. It is not a separate destination. It lives as a **drawer attached to the Map**.

## Purpose

The WanderWall is the Map's narration of itself, in finite form, over the last 24 hours, scoped to the current viewport. It exists so that a Wanderkind can read what has happened in this place, today — and then close the panel and walk on. It does not pull the walker back; it answers them when they come.

## What the WanderWall IS

- A pull-up drawer at the bottom of `/map.html`.
- A finite list of the last 24 hours of public events inside the current Map viewport.
- Reflective of the Map — it re-filters when the Map pans.
- A single-tap path to the underlying record (host pass, vouch detail, stamp page).

## What the WanderWall is NOT — the six refusals

These are not "we'll add them later." They are permanent refusals.

1. **Not a separate page.** `/feed.html` is retired. There is no WanderWall destination outside the Map.
2. **Not a notification source.** No push. No timer. No "new" badge. The WanderWall is checked, not pushed.
3. **Not a scroll surface.** When the 24-hour list ends, the list ends. No "load more."
4. **Not a reaction surface.** No hearts. No likes. No reposts.
5. **Not a recommender.** No "for you" ranking. Everyone in a viewport sees the same WanderWall.
6. **Not a stream of every event.** Knocks, stays, face verifications, and walking-now toggles do not appear.

## Card types (v1)

| # | Event | Source | CTA |
|---|---|---|---|
| 1 | Door opened | `profiles.show_on_map` newly true | open host pass |
| 2 | Vouch published | `publish_vouches` RPC return | open vouch detail |
| 3 | Stamp sealed | `stamps` insert with stay_id | open stamp page |
| 4 | Stamp proposed | `stamp_proposals` insert | open proposal page |

## Refresh cadence

- On drawer open: refresh.
- On Map viewport change: re-filter client-side (no fetch).
- On pull-down in the drawer: refresh.
- Otherwise: silent.

## Youth-path filter

Accounts with `youth_account = true` see only **Stamp Sealed** and **Stamp Proposed** cards. Doors and Vouches are filtered out.

## Surface specification

- Pull handle at the bottom of the Map (above the tabbar, below the zoom controls).
- Default drawer height: 60dvh. Draggable to full-screen or back to peek.
- Backing Map remains visible behind a 12% darkening scrim while open.
- Tap any card → drawer collapses, Map flies to event location, underlying record opens.

## Build order (MVP)

1. Retire `/feed.html` and `/js/feed.js`. Remove from `sw.js` precache. Remove from `/more.html` (already done).
2. SQL: create a read-only view `v_wanderwall_24h` that unions doors-opened + vouches-published + stamps-sealed + stamp-proposals with `(lat, lng, ts, kind, payload)`.
3. HTML: add `<section class="map-wanderwall">` drawer to `/map.html` with the pull handle.
4. JS: `/js/map-wanderwall.js` fetches the view, client-filters by Map bounds, renders the four card types.
5. A11y: keyboard-openable; focus-trapped while open; esc closes; screen-reader announces "WanderWall · N events in this region today."
6. Performance budget: must not increase the Map page's LCP by more than 80 ms. Lazy-fetched on drawer open. No fetch on Map load.

## Decision: connection to the Map

The WanderWall's relationship to the Map is **reflective**, not parallel.

- The Map is the network's body. The WanderWall is the network's voice from that body. The voice comes from the body and returns the listener to it.
- The WanderWall's geographic scope IS the Map's current viewport. They share state. The WanderWall does not have its own filters.
- Tapping a WanderWall card returns the user to the Map at the event's location. The Map is the home.

## Open for Phase 2

- Whether to add "walker is walking" as a card type later, or refuse it permanently. Default: refuse.
- Whether to support a "this week" toggle on the WanderWall alongside the default 24h. Defer until we have real walkers and real signal.
- Whether hosts get a dedicated "House WanderWall" for events around their door. Defer to host phase E.

## Naming

The surface is **The WanderWall**. We do not call it Feed in the UI. The word "feed" carries the patterns we are refusing, and the Network Anthropologist's observation holds: the ancestors of this surface are parish wanderwalls, market boards, and village criers — not Twitter.

---

*Signed: the Wanderkind Board + seven personas, in workshop, May 2026. The full transcript lives at `/wanderkind-feed-workshop.html`.*
