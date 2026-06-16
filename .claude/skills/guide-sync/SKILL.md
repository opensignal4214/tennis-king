---
name: guide-sync
description: Keep GUIDE.md (the source-derived player & systems guide) accurate after any change to Court King's mechanics, numbers, controls, or rules. Use whenever you edit constants/tuning, physics, ball, NPC AI, player strokes, serve, scoring, match flow, input/gamepad controls, doubles, or the difficulty table — anything GUIDE.md documents. Also use when asked to "update the guide", "sync GUIDE.md", "did the guide change", or after landing a gameplay feature/balance change.
---

# Guide sync (Court King)

[GUIDE.md](../../../GUIDE.md) is the **complete player & systems guide**, written so that
every number, rule, and behaviour is taken **directly from the source**, each backed by a
`file:line` reference. Its own preamble promises: *"Nothing here is guesswork — if the code
doesn't say it, it isn't in this guide."*

That promise is only true if the guide is updated **in the same change** that alters the
code. This skill is the checklist for doing that.

## When to update GUIDE.md

Any time a change touches a documented surface, update the guide **before considering the
task done**. Documented surfaces:

- **Constants / tuning** ([js/constants.js](../../../js/constants.js)) — court dims, `GRAV`, `DIFF`, `QUAL`, `PRESS_LEAD`, `CHARGE_*`, serve fault profiles. These drive almost every table in the guide.
- **Physics / ball** ([js/physics.js](../../../js/physics.js), [js/ball.js](../../../js/ball.js)) — gravity/drag/spin, bounce restitution & friction, net height, `groundEvent` point rules, serve-box logic.
- **Player strokes** ([js/player.js](../../../js/player.js)) — timing windows & tiers, charge/power, sweet spot, per-shot base values, the shot-type error model.
- **NPC AI** ([js/npc.js](../../../js/npc.js)) — reaction/pathfinding, shot choice, `aimMix`, net approach, memory, doubles hitter selection / partner logic.
- **Serve** ([js/serve.js](../../../js/serve.js)) — toss/timing, serve speeds, fault model, return positioning.
- **Scoring / match** ([js/scoring.js](../../../js/scoring.js), [js/match.js](../../../js/match.js)) — points/games/sets/tiebreak, win condition, rotation.
- **Controls** ([js/input.js](../../../js/input.js), [js/gamepad.js](../../../js/gamepad.js), and any on-screen hint text e.g. in [js/serve.js](../../../js/serve.js)) — key/button bindings, serve hint strings.
- **Doubles** ([js/menu.js](../../../js/menu.js), [js/state.js](../../../js/state.js)) — entity indexing, court width, rotation, no-poach rule.
- **Utils** ([js/utils.js](../../../js/utils.js)) — `netHeight`, sweet-spot offset/tolerance, helpers the guide quotes.

If a change touches none of these (pure rendering polish, build config, tests, comments), the
guide usually needs no edit — but skim it anyway for any line that happens to reference what
you touched.

## Guide section → source map

| GUIDE.md section | Primary source |
|---|---|
| §1.1 world / coords / net height | `constants.js`, `utils.js` |
| §1.4 controls | `input.js`, `gamepad.js`, hint strings in `serve.js` |
| §1.5 timing rings | `physics.js`, `player.js`, `constants.js` (`PRESS_LEAD`) |
| §1.6 charge / §1.7 sweet spot | `player.js`, `constants.js`, `utils.js` |
| §2.1–2.4 physics / bounce / net / point rules | `ball.js`, `physics.js` |
| §2.5–2.6 error model / per-shot values | `player.js`, `constants.js` (`QUAL`) |
| §3 NPC | `npc.js`, `constants.js` (`DIFF`, `aimMix`) |
| §4 difficulty table | `constants.js` (`DIFF`), `serve.js`, `npc.js` |
| §5 doubles | `npc.js`, `menu.js`, `state.js`, `player.js`, `ball.js` |
| §6 improvement tips | cross-cutting — re-check any tip that cites a number you changed |
| §7 quick reference card | every constant it lists |

## How to do the sync

1. **List what you changed.** From the diff, note every constant value, formula, rule,
   binding, or threshold that moved.
2. **Find every place the guide mentions it.** Search the prose, the tables, AND the quick
   reference card (§7) — a single constant often appears in 2–3 spots (a table row, a tip,
   and the reference card). Use `grep` for the old value:
   ```bash
   grep -n "0.10\|PRESS_LEAD" GUIDE.md      # example: timing lead changed
   ```
3. **Update the number/claim** in each spot so it matches the code exactly.
4. **Update the `file:line` reference** too — line numbers drift when you add/remove lines.
   Open the cited file, confirm the anchor still points at the right code, and fix the
   `js/x.js#Lnn` (and `#Lnn-Lmm` ranges).
5. **Verify, don't guess.** Every claim must be re-derivable from the source you just edited.
   If you can't point to the exact line, don't write the number.

## Conventions to preserve

- Keep the **`file:line` citation style**: `[js/player.js:195](js/player.js#L195)` or a range
  `#L195-L196`. The guide's credibility is the citations being correct.
- Keep numbers in the **same units and precision** the code uses (e.g. `0.45 m`, `27`, `0.10 s`).
- When you add a **new mechanic / shot / control / difficulty knob**, add it to the relevant
  table or section *and* to the §7 quick-reference card if it's a headline value.
- When you **remove** a mechanic, delete its rows/tips — don't leave orphaned claims.
- Match the existing voice: terse, factual, source-anchored. No marketing, no guesswork.

## Quick self-check before finishing

- [ ] Every value I changed in code now reads the same in the guide (prose, tables, §7).
- [ ] Every `file:line` I touched still lands on the right code.
- [ ] No claim in the guide now contradicts the code (skim the affected section end-to-end).
- [ ] New mechanics are documented; removed mechanics are gone.

> If a gameplay change also needs behavioural verification, pair this with the
> **rally-scenario-tests** skill: run the scenario, confirm the numbers, then document them here.
