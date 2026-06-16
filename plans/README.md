# Plans & design docs

This folder is the home for **every plan and design doc** for Court King — the
"why and how" behind features that the code itself doesn't explain. Code says
*what* the game does; these docs say *why it was built that way* and *how a
feature was intended to work*.

When you need the rationale, intended behaviour, or build steps for a feature,
**look here first**, then cross-check against the source (each doc carries
`file:line` citations).

## Index

| Doc | What it covers | Status |
|-----|----------------|--------|
| [STATS_PLAN.md](STATS_PLAN.md) | Live broadcast stats, end-of-match summary, pause-menu stats, landing-zone viz — an aggregator over the existing per-point event log. | Plan |
| [TOUCH_PLAN.md](TOUCH_PLAN.md) | Full iPhone/iPad touch controls as a peer of `gamepad.js`, synthesising the `keys` map (floating move + flick-wedge stroke zones). | Plan |
| [AVATAR_FIX_PLAN.md](AVATAR_FIX_PLAN.md) | Four targeted fixes to the procedural avatar rig & stroke form in `render.js`/`facing.js`. | Plan |

## Conventions

- **One doc per feature/initiative.** Name it `FEATURE_PLAN.md` (or
  `FEATURE_DESIGN.md` for pure design with no build steps), UPPER_SNAKE_CASE.
- **Cite the source.** Reference code as `[js/x.js:NN](../js/x.js#LNN)` — note
  the `../` prefix, since links resolve relative to this folder.
- **Keep it source-anchored.** Same voice as `GUIDE.md`: terse, factual, no
  guesswork. State the *why* the code can't.
- Add a row to the **Index** above when you create a doc; update **Status**
  (`Plan` → `Implemented` / `Superseded`) as it lands.

> `GUIDE.md` (repo root) is **not** a plan — it's the source-derived player &
> systems guide, kept in sync by the `guide-sync` skill. Leave it where it is.
