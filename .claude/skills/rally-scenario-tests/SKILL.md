---
name: rally-scenario-tests
description: Run or extend the Playwright rally-scenario framework for Court King to self-check gameplay changes. Use after editing physics, ball, NPC AI, player strokes, serve, scoring, shot error models, or the logger — anything that affects how points play out. Scripts deterministic 1v1 rallies of a chosen shape (forehand/backhand × ground/volley/smash, per side), collects the structured log, and asserts the right shots happened. Also use when asked to "verify a gameplay change", "test a rally type", "check the AI/physics still works", or "collect match logs".
---

# Rally scenario tests (Court King)

A Playwright framework that drives the real game in a browser, scripts a chosen
rally shape deterministically, and writes the full structured log to disk for
inspection. Built for **self-checking gameplay changes** without a human playing.

## When to use it

Reach for this whenever a change could alter how points play out:

- physics ([js/physics.js](../../../js/physics.js), [js/ball.js](../../../js/ball.js)) — trajectories, bounce, spin, drag
- NPC AI ([js/npc.js](../../../js/npc.js)) — positioning, shot selection, errors
- player strokes ([js/player.js](../../../js/player.js)) — timing windows, shot/error model
- serve ([js/serve.js](../../../js/serve.js)), scoring ([js/scoring.js](../../../js/scoring.js)), or the logger ([js/logger.js](../../../js/logger.js))
- constants/tuning ([js/constants.js](../../../js/constants.js)) — `DIFF`, `QUAL`, speeds

Workflow: **make the change → run the relevant scenario(s) → read the saved log
→ confirm the numbers moved the way you intended (and nothing else broke).**

Use the simpler smoke/serve/rally tests in [test/e2e/game.spec.js](../../../test/e2e/game.spec.js)
for boot/serve/no-error checks; use *this* (scenarios) for shot-shape behaviour.

## How to run

```bash
npm run test:e2e -- scenarios            # full 8-scenario matrix
npm run test:e2e -- scenarios -g "backhand-backhand"   # one scenario
RALLIES=12 npm run test:e2e -- scenarios               # longer rallies
npm run test:e2e                          # everything (game + scenarios + others)
```

- Tests run **serial** (`--workers=1` is the configured default) — they drive a
  real-time loop, so don't parallelise.
- The webServer serves the **built** app (`vite preview`), so a run **rebuilds**
  and picks up your latest code. (Dev-server HMR was too unstable for timing tests.)
- Per-scenario logs are written to `test-results/scenario-logs/<name>.json`.

## The scenario matrix

Defined in [test/e2e/scenarios.spec.js](../../../test/e2e/scenarios.spec.js):
`forehand-forehand`, `forehand-backhand`, `backhand-forehand`, `backhand-backhand`,
`slice-rally`, `volley-volley`, `groundstroke-volley`, `volley-groundstroke`.

Each asserts: clean run (no JS errors), ≥1 exchange, wing/kind dominance for the
intended shape, and net play (volley **or** smash) where expected.

## Atomic model — compose any scenario

Gameplay is decomposed into atoms, so a new scenario is mostly a **data row**, not
new code:

- **state atoms** ([test/e2e/controller.js](../../../test/e2e/controller.js)): `position`, `setWing` (fore/back via x-offset to the ball), `setNet` (baseline vs net depth → ground vs volley)
- **action atoms** ([test/e2e/helpers.js](../../../test/e2e/helpers.js), [test/e2e/scenario.js](../../../test/e2e/scenario.js)): seed RNG, serve, press stroke (J=topspin K=slice L=flat I=lob ;=drop), time the press, aim

To add a scenario, append to `SCENARIOS` in scenarios.spec.js:

```js
{ name: 'my-shape', diff: 'medium',
  human: { wing: 'fore', net: false }, npc: { wing: 'back', net: true },
  shot: 'topspin',                       // human's stroke each return
  expect: { pWing: 'fore', pKind: 'ground', nVolley: true } },
```

Or call the framework directly for ad-hoc checks:

```js
import { runScenario } from './scenario.js';
const r = await runScenario(page, {
  name: 'probe', seed: 777, diff: 'medium', rallies: 8,
  human: { wing: 'back', net: false }, npc: { wing: 'fore', net: false }, shot: 'slice',
});
// r.exchanges, r.summary (playerWings/npcWings/playerKinds/npcKinds/shotTypes), r.errors, r.log, r.logFile
```

## Self-checking with the logs

The saved JSON is the engine's own structured log (`LOGGER`): per point, an
`events[]` of `serve`/`playerShot`/`npcDecision`/`hit`/`bounce`/`fault`/... each
with a position `snap`, plus sampled `frames[]`. Inspect it to verify behaviour:

```bash
node -e "const d=require('./test-results/scenario-logs/forehand-forehand.json'); \
  console.log(d.exchanges, JSON.stringify(d.summary,null,1))"
```

Useful checks after a change:
- **Trajectories finite & in-court**: scan `playerShot.targetIn`, `bounce.inCourt`, no NaN in `snap.ball`.
- **Error model**: counts of `playerShot.shank` / `npcDecision.forcedError`; compare before/after a tuning change.
- **Serve placement**: `bounce.serveBoxOK` on the first serve bounce.
- **AI choices**: distribution of `npcDecision.shotType` / `aimMode`.
- **Determinism**: same `seed` ⇒ identical run; diff two logs to see exactly what a change moved.

## Gotchas

- **Determinism is by seed** (`installSeed`, LCG over `Math.random`). Keep a fixed
  seed when comparing before/after; change it to explore variance.
- **Wings are deterministic; timing is not.** Ground rallies sustain the full
  `rallies`. Net (volley/smash) rallies are real-time-timing sensitive and short —
  net scenarios run on `easy` (slower balls) with burst-press, and assert net play
  occurred rather than a long exchange. Don't tighten net assertions to long counts.
- **Identify a serve event by `type:'serve'`** (the shot type is in `serveType`).
- A leftover `vite` process on port 5173 can make a run reuse a stale server; if you
  see `ERR_CONNECTION_REFUSED`, kill it: `lsof -ti:5173 | xargs kill -9`.
- One retry is configured to absorb timing jitter; a test that only passes on retry
  is a signal the scenario is borderline, not that the engine is fine.
