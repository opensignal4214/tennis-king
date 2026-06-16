# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Plans & design docs

The **why and how** behind features lives in [plans/](plans/) — see
[plans/README.md](plans/README.md) for the index. The source explains *what* the
game does; these docs explain *why it was built that way* and *how a feature was
intended to work*. When you need a feature's rationale, intended behaviour, or
build steps, **look in `plans/` first**, then cross-check the cited source.

Every new plan / design doc must be saved in `plans/` (never the repo root) and
added to its index — the `plan-docs` skill is the checklist. `GUIDE.md` is the
separate source-derived player guide, kept current by the `guide-sync` skill.

## Running the game

Open `index.html` directly in a browser. There is no build step, bundler, package manager, or test suite. ES modules are used, so Chrome/Firefox/Safari work natively; if you need a local server (some browsers block file:// module imports), run:

```
npx serve .
# or
python3 -m http.server
```

## Architecture overview

The game is **Court King**, a semi-3D tennis game rendered on an HTML5 Canvas (`960×600`) using vanilla JavaScript ES modules. All game state flows through a single mutable global object `G` exported from [js/state.js](js/state.js).

### Coordinate system

- The court runs along the **Z axis**: player side is `z > 0` (baseline ~12.6), NPC side is `z < 0` (baseline ~-12.3), net is at `z = 0`.
- Player `0` = human, player `1` = NPC.
- `x` is lateral (positive = right from player's perspective), `y` is height.
- Court half-length `HL = 11.885`, singles width `SW = 4.115`, doubles width `DW = 5.485`, service box depth `SVC = 6.4`.

### Game loop

`main.js` drives everything:
1. `requestAnimationFrame` → `update(dt)` → `render()`
2. `update` calls camera, HUD, serve toss, player, NPC, and ball in that order.
3. `render` uses perspective projection (`camera.js:proj()`) to map 3D world coords to 2D canvas pixels.

### Module responsibilities

| File | Purpose |
|------|---------|
| `state.js` | Single source of truth: `G` (all game state) and `keys` (keyboard map) |
| `constants.js` | Court dimensions, gravity, difficulty configs (`DIFF`), shot quality profiles (`QUAL`) |
| `main.js` | Game loop, `requestAnimationFrame`, wires modules together |
| `render.js` | All canvas drawing: court, net, characters (procedural skeleton animation), ball, timing rings |
| `camera.js` | Camera follow logic; `proj(x,y,z)` → `{x,y,s}` for all 3D→2D projection |
| `physics.js` | `solveShot` (trajectory solver), `simToPlane`/`simBallToNpcZ` (predict ball intercept), `predictLanding` |
| `ball.js` | `updateBall` (integrate physics, bounce/drag/spin), `hitBall`, `groundEvent` (point logic) |
| `player.js` | Human input handling, `strokePress` (timing window + quality), `doPlayerHit` (shot dispatch) |
| `npc.js` | AI: reaction timer, `predictLanding`-based pathfinding, `npcHit` (difficulty-scaled shot selection) |
| `scoring.js` | Tennis scoring: points → games → sets → tiebreaks; `addPoint`, `servingPlayer`, `serveSide` |
| `serve.js` | Serve state machine: toss arc, timing window, `fireServe`, fault handling |
| `match.js` | Point end orchestration, `endPoint`, mode transitions (match vs. rally) |
| `hud.js` | Score/rally overlay updates, shot label flash, feedback popup (`fb`) |
| `menu.js` | Menu DOM wiring, difficulty selection, mode buttons |
| `input.js` | `keydown`/`keyup` listeners, stroke key routing, serve space-bar, mute/menu toggles |
| `audio.js` | Web Audio API: hit, bounce, net sounds |
| `utils.js` | `clamp`, `lerp`, `gauss`, `rnd`, `netHeight`, `name` |

### State machine

`G.state` cycles through: `'menu'` → `'serve'` → `'toss'` → `'live'` → `'point'` → back to `'serve'`. `G.mode` is `'match'` or `'rally'`.

### Shot timing

The timing ring system: `simToPlane` forward-simulates the ball to the player's Z plane and writes the result to `G.strike`. `strokePress` compares `G.strike.t` against `PRESS_LEAD (0.10s)` to classify timing as `perfect/good/ok/weak` which determines power, noise, and shank probability via `QUAL` constants.

### NPC memory

`G.npcMem` accumulates serve landing X positions per side (`serve.deuce[]`, `serve.ad[]`) and `rallyX` (exponential moving average of where the player hits to), used by the NPC to anticipate shots.
