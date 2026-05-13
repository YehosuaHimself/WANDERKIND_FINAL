# CANON — What we refuse

> Mastery is what you refuse to ship.

Updated reluctantly. Every entry is a line that holds. The CI enforces these where it can (see `.github/workflows/quality.yml`); the team enforces the rest.

## We refuse to ship without

- **Lighthouse 100 / 100 / 100 / 100 / 100** (performance · accessibility · best practices · SEO · PWA)
- **First Contentful Paint < 800 ms** on slow 4G
- **Largest Contentful Paint < 1.8 s** on slow 4G
- **Cumulative Layout Shift = 0** (zero, not 0.1)
- **First Input Delay / INP < 100 ms**
- **WCAG 2.1 AA contrast** on every text/background combination (AAA where possible)
- **Full keyboard navigation** with visible designed focus rings
- **`prefers-reduced-motion`** respected — animations off, not damped

## We refuse to load

- Third-party analytics (no Plausible, Fathom, GA — none)
- Tracking pixels, fingerprinting libraries, session replay
- Ads of any kind, ever
- External fonts from CDNs (system Helvetica + Courier only)
- External stock photography (typography-led design)
- Any third-party JavaScript on the critical path

## We refuse to add (V3 §13 verbatim)

- **Gamification.** No leaderboards, no "streak" notifications, no FOMO ("3 Wanderkinder nearby — hurry!"). Stamps are memories. Status tiers are milestones on a personal journey.
- **Emoji in UI.** No emoji in buttons, labels, markers, cards, or navigation. Monoline SVG icons only. Exception: user-generated content (messages, journal entries).
- **Segment-specific language.** Never call users "pilgrims", "hikers", "backpackers", or any segment-specific term in the UI. The user is always a **Wanderkind**. The plural is **Wanderkinder**.
- **Pilgrim-app framing.** Wanderkind is not a pilgrim app. It is not a stamp-collecting app. Never frame features around a single travel style. Routes, stamps, and passes serve ALL Wanderkinder equally.
- **Inline styles for design tokens.** Never hardcode colours, sizes, or spacing in JS. Use CSS custom properties from `tokens.css`. Exception: dynamic values from data (gradients, animation delays).
- **Dark patterns.** No pre-checked consent boxes. No "are you sure you want to miss out?" copy. No hidden unsubscribe. No addictive scroll patterns.
- **Font mixing.** Never use Courier for headings or body text. Never use Helvetica for labels or badges. The two families have absolute, non-negotiable roles.
- **Color-only states.** Never use color as the sole indicator of state (error, success, active). Always pair with icon + label. A Wanderkind with color vision deficiency must have full access.

## We refuse to ship

- Copy that wasn't read aloud by a human and edited
- Features without a written purpose paragraph in the PR description
- Anything we wouldn't show to a designer we respect
- Anything that breaks the design system (changes to tokens require updating `/system.html` simultaneously)
- Anything that pushes a performance metric out of budget
- A new tile in MORE without a written justification
- A new term ("X-er", "user", "member") that competes with **Wanderkind / Wanderkinder**

## We refuse to assume

- That the user is on a fast network (works offline first, always)
- That the user can swipe (every gesture has a tap alternative)
- That the user is between 25-40 (we design for Rosa at 75 AND Kai at 23)
- That the user has read the onboarding (every screen stands alone)
- That the user is on a single travel mode (the road is open in all directions)

## The pact

Decide what's a no. Write it here. Move slowly. The PPWA is the residue of careful decisions accumulated over time.

Companion docs: `DOCTRINE.md` (the Why/How/What + the mantra) · `system.html` (the living design system) · `personas.html` (the 38 wanderkinder we serve).
