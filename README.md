# Wanderkind · PPWA

> **Every Way begins at your door.**

A perfect progressive web app. A community of doors. Vanilla HTML/CSS/JavaScript, hand-crafted, free of frameworks and free of stores.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Markup | Vanilla HTML | The medium |
| Styling | Vanilla CSS + custom properties | Total control, zero abstraction tax |
| Behavior | Vanilla JavaScript (ES modules), Web Components | Smallest possible runtime |
| Types | JSDoc + tsc (typecheck only, never emits) | Editor support without build |
| Reactivity | Hand-rolled signals (~40 lines) | No framework lock-in |
| Routing | Hand-rolled hash router (~60 lines) | Tiny + transparent |
| Offline | Hand-rolled service worker | Auditable, owned, versioned |
| Data | Supabase (Postgres + Auth + Realtime + Storage) | Open, queryable, RLS-protected |
| Map | Leaflet | Open, proven, ~40KB |
| QR | qrcode-generator (~12KB, vendor-free) | Project-Nayuki implementation |
| Hosting | GitHub Pages (custom domain wanderkind.love) | Free, durable, owned |
| CI | GitHub Actions | Already in our toolbox |

**Bundle budget:** 250 KB initial paint, 500 KB total. Lighthouse 100/100/100/100/100 or it doesn't ship.

## Local dev

```
# No install. No build.
python3 -m http.server 8000
# Open http://localhost:8000
```

For service-worker testing, use `localhost` (not `file://`) and a browser that respects SW on `http://localhost`.

For typecheck-only TypeScript via JSDoc:

```
npx -p typescript tsc --noEmit -p .
```

## Deploy

```
git push origin main
# GitHub Pages builds + serves on push. ~60 seconds.
```

The service worker self-updates on next launch via the `/version.json` probe (see `js/sw-register.js`).

## Repo policy

See `CANON.md` for the negative-space doctrine — what we refuse to ship.
