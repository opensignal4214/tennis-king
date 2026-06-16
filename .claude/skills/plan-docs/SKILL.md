---
name: plan-docs
description: Where Court King's plans and design docs live and how to write them. Use whenever you create, update, or look for a plan / design / architecture / RFC / "how should we build X" doc, when asked "why/how is <feature> implemented" or "what was the plan for X", or before finalizing a plan in plan mode. All such docs belong in the plans/ folder — never the repo root.
---

# Plan & design docs (Court King)

Every plan, design doc, architecture note, or "how should we build X" write-up
for Court King lives in **[plans/](../../../plans/)** — never at the repo root.
That folder is the project's record of the *why and how* behind features; the
source explains *what*, these docs explain *why it was built that way*.

## When you CREATE a plan or design doc

Always write it into `plans/`, not the repo root:

1. **Save the file in `plans/`.** Name it `FEATURE_PLAN.md` (build-ready plan with
   steps) or `FEATURE_DESIGN.md` (pure design), UPPER_SNAKE_CASE.
   - This applies to plan-mode output the user asks you to save, design docs,
     RFCs, migration notes — anything that isn't code, the `GUIDE.md`, or
     `CLAUDE.md`.
2. **Add an Index row** in [plans/README.md](../../../plans/README.md) with the
   doc name, a one-line summary, and a Status (`Plan`).
3. **Cite the source with `../`.** Links resolve relative to `plans/`, so write
   `[js/x.js:NN](../js/x.js#LNN)`, not `[js/x.js](js/x.js)`. Match the
   source-anchored, terse voice of the existing docs and `GUIDE.md`.

## When you LOOK for the rationale of a feature

If asked *why* or *how* a feature works, or *what the plan was* for something:

1. **Check `plans/` first** — read [plans/README.md](../../../plans/README.md) to
   find the relevant doc, then the doc itself for intent and build steps.
2. Then cross-check against the cited source; line numbers drift, so verify the
   anchors still land on the right code before quoting them.

## When a plan LANDS or changes

- Update the doc's **Status** in `plans/README.md` (`Plan` → `Implemented` /
  `Superseded`) and prune claims that no longer match the code.
- If the change touched a documented gameplay surface, also run the
  **guide-sync** skill to keep `GUIDE.md` accurate. The two are complementary:
  `plans/` records *why*, `GUIDE.md` records the *current numbers/rules*.

## Boundaries

- **Not a plan:** `GUIDE.md` (source-derived guide → `guide-sync` skill),
  `CLAUDE.md` (agent instructions), code, tests. Don't move these into `plans/`.
- One doc per feature/initiative — extend an existing doc rather than creating a
  near-duplicate.
