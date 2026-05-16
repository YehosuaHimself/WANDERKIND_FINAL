# Spec · [Feature name]

**Status:** Draft / In progress / Shipped / Superseded
**Owner:** Yehosua
**Date:** YYYY-MM-DD
**Anchor commits / files:** _________________

---

## 1 · Purpose

One paragraph. What does this enable that wasn't possible before?

## 2 · Doctrinal alignment

Quote the line(s) of `DOCTRINE.md` and `CANON.md` this serves or honors.
If this feature is in tension with the canon, say so explicitly and explain
how the tension is resolved.

## 3 · Success criteria

What does "done" look like? Behavioral, measurable, dated.

- [ ] _________________
- [ ] _________________
- [ ] _________________

## 4 · Explicit non-goals

What this feature deliberately does NOT do. (Engineering culture lives in
the negative space; specs without a non-goals section accrete scope.)

- _________________
- _________________

## 5 · Surfaces

Which pages / components / routes does this touch?

| File | Change kind |
|---|---|
| `/path/to/file.html` | New / Modified / Removed |
| ... | ... |

## 6 · Data

Tables, columns, RPCs, RLS policies introduced or changed.

```sql
-- e.g.
-- alter table profiles add column ___ ___;
-- create policy ___ on ___ for select using (___);
```

## 7 · Personas

Which personas in `personas.html` did we stress-test this against? Their
positions, paraphrased.

- **Rosa, 75:** _________________
- **Kai, 23:** _________________
- **___, __:** _________________

## 8 · Performance budget

- Bundle delta: < ___ KB
- LCP impact: < ___ ms
- CLS impact: ___
- Lighthouse expected scores: P __ · A __ · BP __ · SEO __

## 9 · Accessibility plan

- Keyboard reachable: yes / no / N/A
- Screen-reader path tested: yes / no
- Reduced-motion respected: yes / no
- Color-only states: none

## 10 · Refusals (the negative space)

Even within the feature, what affordances do we deliberately decline to add?
This is the section that prevents the Feed from becoming Twitter.

- _________________
- _________________

## 11 · Rollout

- Where it lands first (main / beta channel / behind a flag): ___
- Sunsetting plan if it doesn't work: ___

## 12 · Open questions

Unresolved before code can start.

- ___
- ___

---

*Save this file as `docs/specs/YYYY-MM-DD-feature-name.md` and link it from
the PR description.*
