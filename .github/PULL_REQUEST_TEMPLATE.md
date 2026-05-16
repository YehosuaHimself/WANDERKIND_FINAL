<!-- 
  Wanderkind · Pull Request template
  
  CANON.md says: "We refuse to ship: Features without a written purpose
  paragraph in the PR description." Fill every box. If a box doesn't apply,
  write "N/A · [reason]" — don't leave it blank.
-->

## What this does

<!-- One paragraph. Explain the change as if the reader has never seen this
     codebase. Lead with the user-visible outcome, not the implementation. -->

## Why this ships

<!-- The doctrinal justification. How does this serve the mantra
     "Every Way begins at your door"? What does CANON.md say about it? -->

## How it was decided

<!-- Workshop? Board call? Persona feedback? Or just an obvious bug fix?
     Link the artifact if there was one (e.g. FEED_BRIEF.md). -->

## Doctrinal review

- [ ] No gamification, no streak notifications, no FOMO copy.
- [ ] No emoji in UI (or: this is user-generated content).
- [ ] Wanderkind / Wanderkinder is the term — no "users / members / pilgrims".
- [ ] No hard-coded design tokens in JS (uses `tokens.css` variables).
- [ ] No dark patterns.
- [ ] Color is never the sole indicator of state.

## Performance review

- [ ] Bundle size delta is within budget (< 500 KB total app weight).
- [ ] No new third-party scripts on the critical path.
- [ ] LCP / CLS / INP estimated impact: __________
- [ ] Lighthouse expected scores: P __ · A __ · BP __ · SEO __

## Accessibility review

- [ ] Every interactive element keyboard-reachable.
- [ ] Visible designed focus rings.
- [ ] `prefers-reduced-motion` respected.
- [ ] WCAG 2.1 AA contrast on every text/background combo.
- [ ] Tested with VoiceOver (or stated reason it doesn't apply).

## What this refuses to do

<!-- Especially important for feed-like, notification-like, or social
     surfaces. State the affordances we deliberately did NOT add. -->

## Test plan

- [ ] CI green (TypeScript / a11y / Lighthouse / CANON grep / Bundle).
- [ ] Visual smoke tested via the Screenshots workflow.
- [ ] Manual touch test on a real phone (or stated reason it doesn't apply).

## Rollback plan

<!-- One sentence: how do we revert this if it breaks production? -->
