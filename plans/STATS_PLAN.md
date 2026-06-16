# Court King — Match Stats System

A build-ready plan for live broadcast-style stats, an end-of-match summary, a
pause-menu stats view, and an on-court landing-zone visualization.

---

## ✅ Status: SHIPPED (all phases complete)

The full feature is implemented, tested (238 unit + 29 e2e), and screenshot-verified.
The sections below are the original design; the build evolved past them in several
places. **As-built deltas vs. this plan:**

- **Landing chart colouring** is **forehand (orange) / backhand (blue)**, not cross-court /
  down-the-line. Wing is logged for every shot — player *and* CPU — in
  [js/ball.js `hitBall`](../js/ball.js); serves are neutral grey, out balls ringed red.
- **Shot-type filter** chips (Serves / Ground / Volleys / Lobs) toggle which shots show;
  each landing stores a `kind`.
- **Zones %** broadcast-thirds overlay (left/middle/right) with per-zone landing %,
  toggleable on the chart.
- **Chart is device-pixel-ratio rendered** (crisp) and the stats screen is a **dedicated
  overlay** (`#statsscreen`, Back button), laid out **table + court side-by-side** on wide
  screens (stacks on narrow). Opened via the pause menu, the **`Tab`/`L2`** hotkey, or the
  end-of-match screen.
- **Serve speed** uses honest m/s × 3.6 × **`BROADCAST_GAIN = 1.45`** (calibrated: perfect
  flat ≈ 36 m/s → ~190 km/h). Display-only.
- **Live strip persists** (no timer fade) — updates when the next point ends, hides on menu.
- **On-court shot map** overlay toggled with **`Z`/`L1`** ([js/render.js](../js/render.js)).
- **Controller navigation** added for every menu/overlay (D-pad/stick move focus, ✕ confirm,
  ○ back) in [js/gamepad.js](../js/gamepad.js).

Code lives in [js/stats.js](../js/stats.js) (accumulator + renderers), wired through
[js/match.js](../js/match.js), [js/hud.js](../js/hud.js), [js/menu.js](../js/menu.js),
[js/input.js](../js/input.js), [js/gamepad.js](../js/gamepad.js). Tests:
[test/unit/stats.test.js](../test/unit/stats.test.js), [test/e2e/stats.spec.js](../test/e2e/stats.spec.js),
[test/e2e/controller.spec.js](../test/e2e/controller.spec.js). Player-facing docs in
[GUIDE.md](../GUIDE.md) §1.4 and §7.

---

## 0. Premise — the data already exists

[js/logger.js](../js/logger.js) already records a rich per-point event stream
(`serve`, `fault`, `playerShot`, `hit`, `bounce`, `netCord`) with quality,
speed, spin, shank, timing, and a position `snap` on every event. The single
funnel every point flows through is `endPoint` in [js/match.js](../js/match.js).

So this feature is **not** new physics instrumentation — it is:

1. an **aggregator** (`js/stats.js`) that turns logged events into running tallies,
2. **four UI surfaces** that render those tallies.

Today the only persistent stat is `G.stats=[0,0]` (raw points won,
[state.js:12](../js/state.js#L12)) and `G.bestRally`. Everything else is derived.

---

## 1. The stat catalogue — what we show and why

All values are computable from already-logged events. Per-team indexing
`[team0, team1]`, where **team0 = human side**, **team1 = CPU side**.

### Tier A — "headline" (shown live + everywhere)
| Stat | How it's derived |
|---|---|
| Aces / unreturned | point won by serving team with `rallyLen === 1` |
| Double faults | `fault` event with `double:true` → charged to serving team |
| Winners | point won by hitter's own shot bouncing twice (reason `Winner!` / `CPU wins the point`) |
| Unforced errors | point lost to own net/out (`Out!`, `Net!`, `CPU nets it`, `CPU hits it out`, `Double Fault`) |
| Last serve speed | `serve` event `speed`, scaled to km/h |
| Rally length / streak | `rallyLen` per point; running points-in-a-row |

### Tier B — "detail" (pause panel + end screen)
| Stat | How it's derived |
|---|---|
| 1st serve in % | 1st-serve attempts that landed in / total 1st-serve attempts |
| 1st serve points won % | points won when 1st serve was in play |
| 2nd serve points won % | points won when 2nd serve was in play |
| Fastest serve | max `serve.speed` per team → km/h |
| Avg serve speed | mean `serve.speed` per team → km/h |
| Longest rally | max `rallyLen` |
| Avg rally | mean `rallyLen` |
| Total points won | `S.pointsWon` (== existing `G.stats`) |

### Tier C — "skill flavor" (human only — unique to this game, not on TV)
| Stat | How it's derived |
|---|---|
| Timing grade mix | `playerShot.q` tally → Perfect / Good / OK / Weak % |
| Clean-strike % | (perfect + good) / total human shots |

### Tier D — visual (landing-zone map)
Per-team (singles) / per-player (doubles) list of every shot's first-bounce
`{x, z, in, serve}`, rendered as a top-down heat + dot chart (Section 7).

### Doubles — per-player breakdown
In doubles, each of the 4 players gets a dedicated stat line, not just a team
total. Attribution uses `G.lastHitterEntity` (0=you, 1=partner, 2=cpu1, 3=cpu2):

| Per-player stat | Attribution source |
|---|---|
| Aces, double faults, 1st serve %, fastest serve | `rec.server` (entity who served the point) |
| Winners, unforced errors | `lastHitterEntity` on the **point-ending bounce** (the player who hit the last shot) |
| Landings (own map) | `lastHitterEntity` on each bounce |
| Timing / clean-strike | entity 0 only (you) — the partner uses `npcHit`, no timing data |

Team totals are the sum of the two teammates. Singles keeps the simpler
two-column team table (entity 0 = you, the CPU side = the other column).

---

## 2. Architecture

```
                  ┌──────────────┐
   point ends ──► │  endPoint()  │  match.js
                  └──────┬───────┘
                         │ logPointEnd() returns the completed record
                         ▼
                  ┌──────────────┐
                  │ ingestPoint  │  stats.js  ── updates G.matchStats
                  └──────┬───────┘
                         │
        ┌────────────────┼─────────────────┬───────────────────┐
        ▼                ▼                 ▼                   ▼
  flashLiveStats   statsTable()      drawLandingMap()    (G.showZones)
   live strip     pause + end          mini-court        on-court overlay
   (hud.js)        (stats.js)          (stats.js)         (render.js)
```

One write path (`ingestPoint`), four read surfaces. `G.matchStats` is the single
source of truth, initialized in `startGame`, null in rally mode.

---

## 3. UX — every view, mocked

> All mockups use the existing palette: panel `rgba(10,18,30,.82)`, accent
> `#2dd9c0` (teal), accent2 `#ff6b57` (coral), ink `#eef4f8`, dim `#9fb4c8`.

### View 1 — Live broadcast strip (during a match)

Mirrors the scoreboard (which sits **top-left**, [#hud](../css/style.css#L19)) by
sitting **top-right**. A thin row of pills that **fades in for ~2.5s after each
point**, then fades out so it never clutters a live rally.

**Full-screen context (just after a point ends):**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────┐                    🎾 188 km/h · Rally 7 ·        │ ← live strip
│  │      Sets S G Pts   │                       W 4–2 UE · ▲ 3              │   (top-right, fades)
│  │ You    6   1 4  40  🎾                                                   │
│  │ CPU    4   0 3  30                                                       │ ← scoreboard (#hud)
│  └─────────────────────┘                                                   │
│                                                                            │
│                            ·  ·  ·   (court)   ·  ·  ·                      │
│                                                                            │
│                                                                            │
│                                    Game You · 40–30                        │ ← #msg (existing)
│                                                                            │
│                                                          Top Spin · 78%    │ ← #shotlbl (existing)
└──────────────────────────────────────────────────────────────────────────┘
```

**The strip, zoomed:**
```
   ╭──────────────╮ ╭──────────╮ ╭──────────────╮ ╭───────╮
   │ 🎾 188 km/h  │ │ Rally 7  │ │ W 4–2 UE     │ │ ▲ 3   │
   ╰──────────────╯ ╰──────────╯ ╰──────────────╯ ╰───────╯
      serve speed     last rally    your winners     points
   (only if point     length        vs your          won in
    began on a serve)               unforced errors   a row (≥2)
```

Rules:
- Serve-speed pill only appears on points that started with a serve in play.
- `W n–m UE` is always the **human** team's winners vs unforced errors (the TV ratio).
- Streak pill only when ≥2; uses teal for you, coral if CPU is on the streak.
- Hidden entirely in rally mode (rally has its own `#rallyhud`).

### View 2 — End-of-match screen

`showGameOver` already renders into `#overTxt` inside the menu card
([index.html:45](index.html#L45)). We replace the one-line summary with a
two-column comparison table + landing map.

```
        ╔══════════════════════════════════════════════════╗
        ║                                                  ║
        ║              🏆  You win the match!              ║   ← .big, accent
        ║                  6–4, 7–5                         ║   ← .st, dim
        ║                                                  ║
        ║      YOU                              CPU         ║
        ║   ───────────────────────────────────────────    ║
        ║      4    │   Aces                   │   2        ║
        ║      1    │   Double faults          │   3        ║   ← loser-of-row dimmed,
        ║     68%   │   1st serve in           │  55%       ║     leader in accent
        ║     74%   │   1st serve pts won      │  60%       ║
        ║     188   │   Fastest serve (km/h)   │  179       ║
        ║     12    │   Winners                │   8        ║
        ║      7    │   Unforced errors        │  14        ║
        ║     18    │   Longest rally          │  18        ║
        ║   ───────────────────────────────────────────    ║
        ║     61%   │   Clean-strike (you)     │   —        ║   ← Tier C, human only
        ║                                                  ║
        ║          ┌──────────────────────────┐            ║
        ║          │     [ You ] [ CPU ]       │            ║   ← landing-map toggle
        ║          │  ╭────────────────────╮   │            ║
        ║          │  │ ░░░░▓▓░░  · ·       │   │            ║
        ║          │  │ ░▓███▓░  ·· ·       │   │            ║   ← landing-zone map
        ║          │  │ ─────────────────  │   │  (net)     ║     (Section 7)
        ║          │  │   · ·              │   │            ║
        ║          │  ╰────────────────────╯   │            ║
        ║          └──────────────────────────┘            ║
        ║                                                  ║
        ║              [ Match Play ]  [ Rally ]           ║   ← existing menu buttons
        ╚══════════════════════════════════════════════════╝
```

Each table row: `<td>You value</td><td>label</td><td>CPU value</td>`. The leader
of each row renders in accent; the trailing side dims to `--dim`. Ties stay neutral.

### View 3 — Pause-menu stats

`Esc` opens the menu mid-match (`openMenu`, [match.js:70-80](../js/match.js#L70-L80)),
which is just the main menu re-shown. We add a **"Match Stats" button** that only
appears mid-match; clicking it expands the **same** table + map inline.

**Collapsed (default pause view):**
```
        ╔══════════════════════════════════════╗
        ║              COURT KING              ║
        ║            semi-3D tennis            ║
        ║                                      ║
        ║   Difficulty  [Easy][•Medium•][Hard] ║
        ║                                      ║
        ║   Play                               ║
        ║   ┌────────────────────────────────┐ ║
        ║   │ Resume                         │ ║
        ║   ├────────────────────────────────┤ ║
        ║   │ Match Stats                    │ ║ ← NEW (#statsBtn), match only
        ║   │   Aces · winners · serve %     │ ║
        ║   ├────────────────────────────────┤ ║
        ║   │ Match Play                     │ ║
        ║   │ Rally Mode                     │ ║
        ║   └────────────────────────────────┘ ║
        ╚══════════════════════════════════════╝
```

**Expanded (after clicking "Match Stats"):**
```
        ╔══════════════════════════════════════╗
        ║   ┌────────────────────────────────┐ ║
        ║   │ Resume                         │ ║
        ║   │ Match Stats            ▲ hide  │ ║ ← toggles #statsPanel
        ║   └────────────────────────────────┘ ║
        ║   ┌──── #statsPanel ───────────────┐ ║
        ║   │   YOU              CPU          │ ║
        ║   │   ─────────────────────────    │ ║
        ║   │    2  │ Aces            │  1    │ ║  same statsTable() renderer
        ║   │    0  │ Double faults   │  1    │ ║  as the end screen, fed the
        ║   │   71% │ 1st serve in    │ 58%   │ ║  in-progress G.matchStats
        ║   │    6  │ Winners         │  4    │ ║
        ║   │    3  │ Unforced errors │  6    │ ║
        ║   │  ┌──────────────────────────┐  │ ║
        ║   │  │   [ You ] [ CPU ]        │  │ ║  landing map, same canvas
        ║   │  │   ╭──────────────────╮   │  │ ║
        ║   │  │   │  ░▓██▓░  · ·      │   │  │ ║
        ║   │  │   ╰──────────────────╯   │  │ ║
        ║   │  └──────────────────────────┘  │ ║
        ║   └────────────────────────────────┘ ║
        ║   Match Play / Rally ...             ║
        ╚══════════════════════════════════════╝
```

### View 4 — Landing-zone map (the visual stat)

Top-down schematic court (broadcast "land zone" style). Player baseline at the
**bottom**, net across the **middle**, CPU baseline at the **top**. Each shot's
first bounce is a dot (green = in, red = out, faded = serve); a 9×12 heat grid
shades the busy zones amber.

```
        [ You ]  CPU            ← toggle: whose shots to show

        ╭──────────────────────╮  ← CPU baseline (z = -HL)
        │  ░░  ▓▓▓  ░░   ·      │
        │  ░  ▓███▓  ░    ·· ·  │   amber heat = where your
        │      ▓▓▓        ·     │   shots cluster on CPU's half
        │   ┌───────────────┐   │
        │   │ ░  · ·   ░░    │   │   (service boxes outlined)
        ├───┴───────────────┴───┤  ← NET (white line, z = 0)
        │                       │
        │        (your half —   │   when toggled to "CPU", their
        │         empty for     │   shot landings appear here
        │         your view)    │
        ╰──────────────────────╯  ← your baseline (z = +HL)

        ● in    ● out    ◌ serve
```

Default view = **your** shots landing on CPU's half (the "where do I place the
ball" read). Toggle to CPU shows where they attack you.

### View 5 — Optional on-court overlay (opt-in)

Pressing a toggle key (e.g. `Z`) draws your accumulated landings directly on the
**perspective** court (reusing `proj`), like a persistent version of the existing
bounce splats. Off by default; for a "review my placement" moment, not live play.

```
┌──────────────────────────────────────────────┐
│                                              │
│              ·∘·   ∘∘∘   ·                    │  green/red translucent
│             ∘███∘    ·                        │  ellipses on the far
│   ─────────────────────────────  (net)        │  (CPU) half
│                                              │
│                   🎾  (live ball)             │
│                  🧍 (you)                      │
└──────────────────────────────────────────────┘
```

---

## 4. Data layer (Phase 1)

### 4a. New file: `js/stats.js`

```js
import { G } from './state.js';
import { DW, SW, HL, SVC } from './constants.js';

// The world is in real metres & seconds (HL=11.885 m, GRAV=9.81), so a serve's
// velocity vector is already m/s. Honest conversion is ×3.6. BROADCAST_GAIN is a
// cosmetic dial: 1.0 = physically true (~120-145 km/h here), ~1.35 makes flat
// serves read pro-like (~185-195). See Section 11 for the calibration procedure.
export const MS_TO_KMH = 3.6;
export const BROADCAST_GAIN = 1.0;              // bump after calibrating
const kmh = ms => Math.round(ms * MS_TO_KMH * BROADCAST_GAIN);

const blankPlayer = () => ({
  aces:0, doubleFaults:0, firstIn:0, firstTotal:0,
  winners:0, unforced:0, fastServe:0, sumServe:0, nServe:0,
  landings:[], timing:{perfect:0, good:0, ok:0, weak:0},
});

// Team-level [team0=human, team1=cpu] for singles + team totals;
// players[0..3] for the doubles per-entity breakdown (unused in singles).
export function newStats() {
  return {
    pointsWon:[0,0], aces:[0,0], doubleFaults:[0,0],
    firstIn:[0,0], firstTotal:[0,0], firstWon:[0,0],
    secondTotal:[0,0], secondWon:[0,0],
    winners:[0,0], unforced:[0,0],
    fastServe:[0,0], sumServe:[0,0], nServe:[0,0],
    longestRally:0, sumRally:0, nPoints:0, streak:[0,0],
    timing:{perfect:0, good:0, ok:0, weak:0},   // human shots only
    landings:[[], []],                          // team-level {x, z, in, serve}
    players:[blankPlayer(), blankPlayer(), blankPlayer(), blankPlayer()],
  };
}

const ERR_REASONS = ['Out!','Net!','CPU nets it','CPU hits it out'];
const WIN_REASONS = ['Winner!','CPU wins the point'];

// rec = completed point record from logPointEnd(); may be null if logging is off.
export function ingestPoint(rec, w, reason, rallyLen) {
  const S = G.matchStats; if (!S) return;
  const o = 1 - w;
  S.pointsWon[w]++; S.nPoints++;
  S.streak[w]++; S.streak[o] = 0;
  S.sumRally += rallyLen;
  S.longestRally = Math.max(S.longestRally, rallyLen);

  if (WIN_REASONS.includes(reason)) S.winners[w]++;
  else if (ERR_REASONS.includes(reason) || reason === 'Double Fault') S.unforced[o]++;

  if (!rec || !rec.events) return;               // coarse path if logging disabled
  const dbl = G.matchType === 'doubles';
  const svEnt = rec.server;                       // entity 0..3 who served
  const svTeam = svEnt < 2 ? 0 : 1;
  const sp = dbl ? (i => S.players[i]) : null;    // per-entity accessor
  const serves = rec.events.filter(e => e.type === 'serve');
  const faults = rec.events.filter(e => e.type === 'fault');

  const first = serves.find(e => e.serveNum === 1);
  if (first) {
    S.firstTotal[svTeam]++; if (dbl) sp(svEnt).firstTotal++;
    if (!faults.some(f => f.serveNum === 1)) { S.firstIn[svTeam]++; if (dbl) sp(svEnt).firstIn++; }
  }
  const inPlay = serves[serves.length - 1];      // serve that actually started the rally
  if (inPlay) {
    const v = inPlay.vmag || inPlay.speed || 0;  // m/s; vmag = true launch velocity
    S.fastServe[svTeam] = Math.max(S.fastServe[svTeam], v);
    S.sumServe[svTeam] += v; S.nServe[svTeam]++;
    if (dbl) { const e = sp(svEnt); e.fastServe = Math.max(e.fastServe, v); e.sumServe += v; e.nServe++; }
    const won = (w === svTeam);
    if (inPlay.serveNum === 1) { if (won) S.firstWon[svTeam]++; }
    else { S.secondTotal[svTeam]++; if (won) S.secondWon[svTeam]++; }
  }
  if (reason === 'Double Fault') { S.doubleFaults[svTeam]++; if (dbl) sp(svEnt).doubleFaults++; }
  if (rallyLen === 1 && w === svTeam && reason !== 'Double Fault') {
    S.aces[svTeam]++; if (dbl) sp(svEnt).aces++;
  }

  // Winner / unforced error → attribute to the entity who hit the point-ending shot.
  const bounces = rec.events.filter(e => e.type === 'bounce');
  const decider = bounces.length ? bounces[bounces.length - 1].snap.ball.lastHitterEntity : null;
  if (dbl && decider != null) {
    if (WIN_REASONS.includes(reason)) sp(decider).winners++;
    else if (ERR_REASONS.includes(reason)) sp(decider).unforced++;
    else if (reason === 'Double Fault') sp(svEnt).unforced++;
  }

  for (const e of rec.events) {
    if (e.type === 'playerShot' && S.timing[e.q] !== undefined) {
      S.timing[e.q]++; if (dbl) sp(0).timing[e.q]++;   // playerShot is always entity 0
    }
    if (e.type === 'bounce' && e.bounceN === 0) {
      const team = e.snap.ball.lastHitter;             // team index
      const ent  = e.snap.ball.lastHitterEntity;       // entity index
      const shot = { x:e.snap.ball.x, z:e.snap.ball.z, in:e.inCourt, serve:e.isServe };
      const tArr = S.landings[team]; if (tArr) { tArr.push(shot); if (tArr.length > 80) tArr.shift(); }
      if (dbl && ent != null) { const eArr = sp(ent).landings; eArr.push(shot); if (eArr.length > 60) eArr.shift(); }
    }
  }
}

// ---- formatters / renderers (Sections 5 + 7) ----
const pct = (a,b) => b ? Math.round(100*a/b) + '%' : '–';
export { kmh };

export function statsTable(S) { /* Section 5 */ }
export function drawLandingMap(canvas, team) { /* Section 7 */ }
```

### 4b. `logPointEnd` returns the record — [logger.js:79-92](../js/logger.js#L79-L92)

**Before:**
```js
export function logPointEnd(data) {
  if (!LOG.enabled || !LOG.point) return;
  Object.assign(LOG.point, data, { t1: r3(LOG.t) });
  const m = curMatch();
  if (m) m.points.push(LOG.point);
  LOG.point = null;
  // enforce global point cap
  let total = LOG.matches.reduce((s, mm) => s + mm.points.length, 0);
  for (const mm of LOG.matches) {
    while (total > MAX_POINTS && mm.points.length) {
      mm.points.shift(); LOG.droppedPoints++; total--;
    }
  }
}
```

**After:**
```js
export function logPointEnd(data) {
  if (!LOG.enabled || !LOG.point) return null;
  Object.assign(LOG.point, data, { t1: r3(LOG.t) });
  const rec = LOG.point;
  const m = curMatch();
  if (m) m.points.push(rec);
  LOG.point = null;
  // enforce global point cap
  let total = LOG.matches.reduce((s, mm) => s + mm.points.length, 0);
  for (const mm of LOG.matches) {
    while (total > MAX_POINTS && mm.points.length) {
      mm.points.shift(); LOG.droppedPoints++; total--;
    }
  }
  return rec;
}
```

### 4c. `endPoint` ingests — [match.js:10-32](../js/match.js#L10-L32)

Add imports at top of [match.js](../js/match.js):
```js
import { ingestPoint } from './stats.js';
```
(`servingPlayer` is not needed here — `rec.server` already carries the correct
entity from `logPointStart`.)

**Before (the two `logPointEnd(...)` call sites):**
```js
    logPointEnd({ winner: w, reason, rallyLen, scoreAfter: null, stats: [...G.stats] });
    showMsg(reason, `rally of ${rallyLen}`, 1.5);
```
```js
    logPointEnd({ winner: w, reason, rallyLen, scoreAfter: JSON.parse(JSON.stringify(G.score)), stats: [...G.stats] });
    showMsg(reason, sub, 1.9);
```

**After:**
```js
    const rec = logPointEnd({ winner: w, reason, rallyLen, scoreAfter: null, stats: [...G.stats] });
    ingestPoint(rec, w, reason, rallyLen);
    showMsg(reason, `rally of ${rallyLen}`, 1.5);
```
```js
    const rec = logPointEnd({ winner: w, reason, rallyLen, scoreAfter: JSON.parse(JSON.stringify(G.score)), stats: [...G.stats] });
    ingestPoint(rec, w, reason, rallyLen);
    showMsg(reason, sub, 1.9);
```
Then at the very end of `endPoint`, after `refreshHUD();`, add:
```js
  flashLiveStats();      // imported from hud.js (Phase 4)
```

### 4d. Initialize / reset — [state.js:12](../js/state.js#L12) and [match.js:48](../js/match.js#L48)

state.js, **after** `rally:0, bestRally:0, stats:[0,0],`:
```js
  matchStats:null,
```

match.js `startGame`, **after** `G.stats = [0, 0]; ...`:
```js
  G.matchStats = (mode === 'match') ? newStats() : null;   // null in rally mode
```
Add `newStats` to the stats.js import in match.js.

**Phase 1 verification:** play several points, run `console.log(G.matchStats)`.
Confirm `pointsWon`, `winners`, `unforced`, serve counts, and `landings` populate.

### 4e. Entity attribution prerequisites (required for doubles per-player)

`G.lastHitterEntity` (0=you, 1=partner, 2=cpu1, 3=cpu2) is already set by serves
([serve.js:267](../js/serve.js#L267)) and every CPU/partner hit
([npc.js:232,426,632](../js/npc.js)) — but **not** by the human's groundstroke, and
it is **not** captured in the logger snapshot. Two small fixes close both gaps.

**(1) Human hit stamps its entity** — [player.js:329](../js/player.js#L329),
`doPlayerHit`, immediately before `hitBall(0, ...)`:
```js
  G.lastHitterEntity = 0;
  hitBall(0, tx, tz, speed, spin, clear, shotType);
```

**(2) Snapshot carries the entity** — [logger.js:19-31](../js/logger.js#L19-L31),
`snapshot()`, add to the `ball` object:
```js
      netHit: b.netHit, isServe: b.isServe, lastHitter: b.lastHitter,
      lastHitterEntity: G.lastHitterEntity,      // <-- new: 0=you,1=partner,2=cpu1,3=cpu2
```

**(3) Serve logs true launch velocity** — [serve.js:277-281](../js/serve.js#L277-L281),
the `logEvent('serve', …)` call, add `vmag` (and set the live-strip km/h from the
real vector, not the launch-speed param):
```js
  const vmag = Math.hypot(b.vx, b.vy, b.vz);     // m/s — actual ball speed off the racket
  G._lastServeKmh = kmh(vmag);                   // kmh() imported from stats.js
  logEvent('serve', {
    server: sv, serveNum: G.serveNum, q, serveType: type || 'flat',
    speed, vmag, target: { tx, tz }, aim: { ax, az }, curve, contactY: b.y,
    predicted: predictLanding(),
  });
```
This makes the displayed serve speed physically derived (Section 11), and lets
`ingestPoint` read `inPlay.vmag` for fastest/avg serve.

---

## 5. Stats table renderer (Phase 2 — shared by views 2 & 3)

In `stats.js`. Returns an HTML string; rows are `[you, label, cpu]`, leader in
accent. Tier-C rows pass `human:true` (CPU cell shows `—`).

```js
export function statsTable(S) {
  if (!S || !S.nPoints) return `<div class="st">No stats yet.</div>`;
  const avgRally = (S.sumRally / S.nPoints).toFixed(1);
  const row = (a, label, b, human) => {
    const an = parseFloat(a), bn = parseFloat(b);
    const aCls = human ? 'win' : (an > bn ? 'win' : an < bn ? 'lose' : '');
    const bCls = human ? 'dim' : (bn > an ? 'win' : bn < an ? 'lose' : '');
    return `<tr><td class="${aCls}">${a}</td><td class="lbl">${label}</td>`
         + `<td class="${bCls}">${human ? '—' : b}</td></tr>`;
  };
  const clean = S.timing.perfect + S.timing.good;
  const totT  = clean + S.timing.ok + S.timing.weak;
  return `<table class="statgrid">
    <tr class="hdr"><td>You</td><td></td><td>CPU</td></tr>
    ${row(S.aces[0], 'Aces', S.aces[1])}
    ${row(S.doubleFaults[0], 'Double faults', S.doubleFaults[1])}
    ${row(pct(S.firstIn[0],S.firstTotal[0]), '1st serve in', pct(S.firstIn[1],S.firstTotal[1]))}
    ${row(pct(S.firstWon[0],S.firstIn[0]), '1st serve pts won', pct(S.firstWon[1],S.firstIn[1]))}
    ${row(kmh(S.fastServe[0]), 'Fastest serve', kmh(S.fastServe[1]))}
    ${row(S.winners[0], 'Winners', S.winners[1])}
    ${row(S.unforced[0], 'Unforced errors', S.unforced[1])}
    ${row(S.longestRally, 'Longest rally', S.longestRally)}
    ${row(avgRally, 'Avg rally', avgRally)}
    ${row(pct(clean,totT), 'Clean-strike', '', true)}
  </table>`;
}
```
(`pct` is the module-local helper from 4a.)

### 5b. Doubles — per-player table

In doubles, `statsTable` delegates to a 4-column layout (one per entity, grouped
by team). Team headers span their two players; the leading value per row is
accented.

```
        YOUR TEAM            ·            CPU TEAM
     You      Partner                CPU 1     CPU 2
   ───────────────────────────────────────────────────
     2          1      Aces           0          1
     0          0      Double faults  1          0
    71%        64%     1st serve in   58%        60%
     5          3      Winners        2          4
     2          1      Unforced err   3          3
    188        171     Fastest (km/h) 179        165
   ───────────────────────────────────────────────────
    61%         —      Clean-strike    —          —     ← entity 0 (you) only
```

```js
export function doublesTable(S) {
  const P = S.players;
  const cell = (v, lead) => `<td class="${lead ? 'win' : 'dim'}">${v}</td>`;
  // lead = best value across all four players in that row
  const row = (label, vals, fmt = x => x, better = 'hi') => {
    const nums = vals.map(v => parseFloat(v));
    const best = better === 'hi' ? Math.max(...nums) : Math.min(...nums);
    return `<tr>${vals.map((v, i) =>
      cell(fmt(v), nums[i] === best && best > 0)).slice(0, 2).join('')}` +
      `<td class="lbl">${label}</td>` +
      `${vals.map((v, i) => cell(fmt(v), nums[i] === best && best > 0)).slice(2).join('')}</tr>`;
  };
  const pin = i => pct(P[i].firstIn, P[i].firstTotal);
  return `<table class="statgrid dbl">
    <tr class="hdr"><td colspan="2">Your team</td><td></td><td colspan="2">CPU team</td></tr>
    <tr class="hdr2"><td>You</td><td>Partner</td><td></td><td>CPU 1</td><td>CPU 2</td></tr>
    ${row('Aces',          [P[0].aces, P[1].aces, P[2].aces, P[3].aces])}
    ${row('Double faults', [P[0].doubleFaults, P[1].doubleFaults, P[2].doubleFaults, P[3].doubleFaults], x=>x, 'lo')}
    ${row('1st serve in',  [pin(0), pin(1), pin(2), pin(3)])}
    ${row('Winners',       [P[0].winners, P[1].winners, P[2].winners, P[3].winners])}
    ${row('Unforced err',  [P[0].unforced, P[1].unforced, P[2].unforced, P[3].unforced], x=>x, 'lo')}
    ${row('Fastest (km/h)',[P[0].fastServe, P[1].fastServe, P[2].fastServe, P[3].fastServe].map(kmh))}
  </table>`;
}
```
`statsTable` becomes a dispatcher:
```js
export function statsTable(S) {
  if (!S || !S.nPoints) return `<div class="st">No stats yet.</div>`;
  return G.matchType === 'doubles' ? doublesTable(S) : singlesTable(S);
}
```
(rename the Section-5 body to `singlesTable`). Add CSS:
```css
.statgrid.dbl td{padding:.18em .55em}
.statgrid .hdr2 td{color:var(--dim);font-size:.7em;text-transform:uppercase}
```

### CSS — append to [css/style.css](../css/style.css)
```css
.statgrid{border-collapse:collapse;margin:.6em auto 0;font-variant-numeric:tabular-nums}
.statgrid td{padding:.18em .8em;font-size:clamp(11px,1.5vw,15px)}
.statgrid td.lbl{color:var(--dim);text-align:center;font-size:.85em}
.statgrid td:first-child{text-align:right}
.statgrid td:last-child{text-align:left}
.statgrid .hdr td{color:var(--dim);text-transform:uppercase;letter-spacing:.08em;font-size:.7em}
.statgrid .win{color:var(--accent);font-weight:700}
.statgrid .lose,.statgrid .dim{color:var(--dim)}
```

---

## 6. The three text/DOM surfaces

### 6a. End screen — [match.js:34-42](../js/match.js#L34-L42) `showGameOver`

**Before:**
```js
  $('overTxt').innerHTML = `<span class="big">${w === 0 ? '🏆 You win the match!' : 'CPU wins the match'}</span>
    <div class="st">${sets} &nbsp;·&nbsp; points won: You ${G.stats[0]} — CPU ${G.stats[1]}</div>`;
```

**After:**
```js
  $('overTxt').innerHTML =
    `<span class="big">${w === 0 ? '🏆 You win the match!' : 'CPU wins the match'}</span>
     <div class="st">${sets}</div>`
    + statsTable(G.matchStats)
    + landingMapBlock();      // Section 7c
```
Add `import { statsTable, landingMapBlock, drawLandingMap } from './stats.js';`
to match.js, and after `openMenu()` call `drawLandingMap($('landmap'), 0);`.

### 6b. Live strip — Phase 4

[index.html:18](index.html#L18), after `<div id="shotlbl"></div>`:
```html
    <div id="livestats"></div>
```

[hud.js](../js/hud.js): add element ref + timer + `flashLiveStats`, and decay it in
`tickHud`.
```js
export const liveStatsEl = $('livestats');
let liveTimer = 0;

export function flashLiveStats() {
  const S = G.matchStats;
  if (!S || G.mode === 'rally') { liveStatsEl.style.opacity = 0; return; }
  const pill = t => `<span class="ls-pill">${t}</span>`;
  const spd = G._lastServeKmh ? pill(`🎾 ${G._lastServeKmh} km/h`) : '';
  const onStreak = S.streak[0] >= 2 ? 0 : S.streak[1] >= 2 ? 1 : -1;
  const streak = onStreak >= 0
    ? `<span class="ls-pill ${onStreak === 0 ? 'good' : 'bad'}">▲ ${S.streak[onStreak]}</span>` : '';
  liveStatsEl.innerHTML = spd
    + pill(`Rally ${G.rally}`)
    + pill(`W ${S.winners[0]}–${S.unforced[0]} UE`)
    + streak;
  liveStatsEl.style.opacity = 1; liveTimer = 2.5;
}
```
In `tickHud` ([hud.js:31-35](../js/hud.js#L31-L35)) add alongside the other timers:
```js
  if (liveTimer > 0) { liveTimer -= dt; if (liveTimer <= 0) liveStatsEl.style.opacity = 0; }
```
`G._lastServeKmh` is already set in `fireServe` from the true velocity vector
(Section 4e-3) — the strip just reads it. No extra serve.js change here.

CSS:
```css
#livestats{position:absolute;top:4.6%;right:2%;display:flex;gap:.4em;
  font-size:clamp(9px,1.4vw,13px);opacity:0;transition:opacity .2s;
  pointer-events:none;font-variant-numeric:tabular-nums}
.ls-pill{background:var(--panel);border:1px solid rgba(255,255,255,.12);
  border-radius:999px;padding:.25em .7em;backdrop-filter:blur(4px)}
.ls-pill.good{color:var(--accent)} .ls-pill.bad{color:var(--accent2)}
```

### 6c. Pause panel — Phase 3

[index.html:53](index.html#L53), after `<button class="bigbtn" id="resumeBtn">Resume</button>`:
```html
      <button class="bigbtn" id="statsBtn" style="display:none">Match Stats<span class="d">Aces · winners · serve % so far</span></button>
      <div id="statsPanel" style="display:none"></div>
```

[match.js](../js/match.js) `openMenu`, after the `resumeBtn` line (~[match.js:78](../js/match.js#L78)):
```js
  const showStats = G.started && G.matchStats && G.mode === 'match';
  $('statsBtn').style.display = showStats ? 'block' : 'none';
  $('statsPanel').style.display = 'none';
```

[menu.js](../js/menu.js), new handler (import `statsTable, landingMapBlock,
drawLandingMap` from stats.js):
```js
document.getElementById('statsBtn').addEventListener('click', () => {
  const panel = document.getElementById('statsPanel');
  const open = panel.style.display !== 'none';
  if (open) { panel.style.display = 'none'; return; }
  panel.innerHTML = statsTable(G.matchStats) + landingMapBlock();
  panel.style.display = 'block';
  drawLandingMap(document.getElementById('landmap'), 0);
});
```

---

## 7. Landing-zone visualization (Phase 5)

### 7a. The HTML block (shared by end screen + pause)

```js
// stats.js — toggle buttons differ by mode (2 in singles, 4 in doubles).
export function landingMapBlock() {
  const btns = G.matchType === 'doubles'
    ? [[0,'You'],[1,'Partner'],[2,'CPU 1'],[3,'CPU 2']]
    : [[0,'You'],[1,'CPU']];
  const row = btns.map(([k,l],i) =>
    `<button class="pill ${i===0?'sel':''}" data-lm="${k}">${l}</button>`).join('');
  return `<div class="lm-toggle">${row}</div>`
       + `<canvas id="landmap" width="220" height="300"></canvas>`;
}

// Resolve a toggle key to the right landing array: team index (singles)
// or entity index (doubles).
function landingsFor(key) {
  const S = G.matchStats; if (!S) return [];
  return G.matchType === 'doubles'
    ? (S.players[key]?.landings || [])
    : (S.landings[key] || []);
}
```
Call sites are unchanged: `drawLandingMap(canvas, key)` resolves the array
internally, so the `data-lm` toggle and the end-screen/pause defaults all still
pass a key of `0` (= You).
Toggle wiring (in menu.js, delegated; redraws on click):
```js
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lm]'); if (!b) return;
  b.parentElement.querySelectorAll('[data-lm]').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel');
  drawLandingMap(document.getElementById('landmap'), +b.dataset.lm);
});
```

### 7b. The renderer (top-down, independent of `proj`)

```js
export function drawLandingMap(canvas, key) {
  const S = G.matchStats; if (!S || !canvas) return;
  const pts = landingsFor(key);
  const ctx = canvas.getContext('2d'), cw = canvas.width, ch = canvas.height, pad = 10;
  const sx = x => pad + (x + DW) / (2*DW) * (cw - 2*pad);
  const sy = z => pad + (HL - z) / (2*HL) * (ch - 2*pad);   // +z baseline at bottom
  ctx.clearRect(0,0,cw,ch);
  ctx.fillStyle = '#2f6fb3';
  ctx.fillRect(sx(-DW), sy(HL), sx(DW)-sx(-DW), sy(-HL)-sy(HL));
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
  const box = (x1,z1,x2,z2) => ctx.strokeRect(sx(x1), sy(z1), sx(x2)-sx(x1), sy(z2)-sy(z1));
  box(-DW,HL,DW,-HL); box(-SW,HL,SW,-HL); box(-SW,SVC,SW,-SVC);
  ctx.beginPath(); ctx.moveTo(sx(-DW),sy(0)); ctx.lineTo(sx(DW),sy(0));
  ctx.strokeStyle = '#eef3f7'; ctx.lineWidth = 2; ctx.stroke();

  // heat grid 9 x 12
  const NX=9, NZ=12, bins=new Float32Array(NX*NZ); let max=0;
  for (const L of pts) {
    const ix=Math.min(NX-1,Math.max(0,Math.floor((L.x+DW)/(2*DW)*NX)));
    const iz=Math.min(NZ-1,Math.max(0,Math.floor((HL-L.z)/(2*HL)*NZ)));
    const k=iz*NX+ix; bins[k]++; if (bins[k]>max) max=bins[k];
  }
  const gw=(sx(DW)-sx(-DW))/NX, gh=(sy(-HL)-sy(HL))/NZ;
  if (max>0) for (let iz=0;iz<NZ;iz++) for (let ix=0;ix<NX;ix++) {
    const v=bins[iz*NX+ix]; if (!v) continue;
    ctx.fillStyle=`rgba(255,196,0,${0.12+0.55*(v/max)})`;
    ctx.fillRect(sx(-DW)+ix*gw, sy(HL)+iz*gh, gw, gh);
  }
  // dots
  for (const L of pts) {
    ctx.globalAlpha = L.serve ? 0.55 : 1;
    ctx.fillStyle = L.in ? 'rgba(80,230,140,.9)' : 'rgba(235,90,90,.9)';
    ctx.beginPath(); ctx.arc(sx(L.x), sy(L.z), 2.4, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
```

### 7c. CSS
```css
#landmap{display:block;margin:.6em auto 0;border-radius:6px;background:#0e1a2c}
.lm-toggle{display:flex;gap:.4em;justify-content:center;margin-top:.8em}
.lm-toggle .pill{padding:.3em 1em;font-size:.85em}
```

### 7d. Optional on-court overlay (Phase 6)

[render.js](../js/render.js), after the bounce-mark loop ([render.js:83-88](../js/render.js#L83-L88)):
```js
if (G.showZones && G.matchStats) {
  for (const L of G.matchStats.landings[0]) {
    const p = proj(L.x, 0.01, L.z); if (!p) continue;
    ctx.fillStyle = L.in ? 'rgba(80,230,140,.45)' : 'rgba(235,90,90,.45)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.s*0.22, p.s*0.08, 0, 0, 7); ctx.fill();
  }
}
```
Toggle in [input.js](../js/input.js) keydown (alongside the `KeyM`/`KeyG`/`KeyH` handlers):
```js
  if (e.code === 'KeyZ') { G.showZones = !G.showZones; showShot(G.showZones ? 'Zones on' : 'Zones off'); return; }
```
Add `showZones:false` to the `G` object in [state.js](../js/state.js) and document
the `Z` key in the controls card ([index.html:20-39](index.html#L20-L39)) and
`#help` strip.

---

## 8. Edge cases & decisions

- **Doubles:** stats are team-indexed; `rec.server < 2 ⇒ team0` attributes serves.
  Timing grades count only `playerShot` (human entity 0) — partner uses `npcHit`,
  so the timing mix is labelled "your timing" and excludes the AI partner.
- **Rally mode:** `G.matchStats = null`; live strip and panels are match-only.
  Rally keeps its existing `#rallyhud` best-rally display.
- **Single fault vs double fault:** only the serve that actually starts the rally
  (`serves[last]`) feeds 1st/2nd-won; a faulted 1st serve counts as an attempt
  but not "in".
- **Logger disabled** (`LOG.enabled=false`): `ingestPoint` still tallies points,
  winners, unforced errors, rally length, and streak from `(w, reason, rallyLen)`;
  serve %, timing, and landings silently skip. Acceptable degradation.
- **Serve speed is physically derived,** not a tuned constant — the world is in
  metres/seconds, so `km/h = |v| × 3.6`. `BROADCAST_GAIN` is an optional cosmetic
  multiplier; calibration procedure in Section 11.
- **Memory:** `landings` capped at 80/team (shift-on-overflow, like `bounceMarks`).

---

## 9. Build phases

| Phase | Deliverable | Risk | Depends on |
|---|---|---|---|
| 1 | Entity prerequisites (4e: `doPlayerHit` stamp, snapshot field, serve `vmag`) | low | — |
| 2 | `stats.js` core + `logPointEnd` returns record + wire `endPoint`/`startGame`/`state` | low | 1 |
| 3 | `singlesTable()` + end-screen rewrite + CSS | low | 2 |
| 4 | `doublesTable()` per-player + dispatcher | low | 3 |
| 5 | Pause `#statsBtn`/`#statsPanel` + menu handler | low | 3 |
| 6 | Live strip `#livestats` + `flashLiveStats` (reads `G._lastServeKmh`) | med | 2 |
| 7 | Landing map `drawLandingMap` + `landingMapBlock` + per-entity toggle | med | 2, 3 |
| 8 | Serve-speed calibration pass (Section 11) — set `BROADCAST_GAIN` | low | 2 |
| 9 | *(optional)* on-court `G.showZones` overlay + `Z` key | low | 2 |

Phase 1 is the only hard prerequisite (it's what makes per-entity attribution and
honest speed possible). Phases 3-9 each render data Phase 2 collects, so they can
land independently after Phase 2.

---

## 11. Calibrating serve speed

There is **no fudge constant to guess** — the simulation already uses real units:
court length `HL = 11.885 m`, net `0.92 m`, `GRAV = 9.81 m/s²`. Therefore the ball's
velocity vector right after the racket is already in **m/s**, and the honest
conversion is the SI one: `km/h = |v| × 3.6`.

### Procedure
1. **Measure the real number.** The serve event now logs `vmag = √(vx²+vy²+vz²)`
   (Section 4e-3). Temporarily log it:
   ```js
   console.log('serve m/s', vmag.toFixed(1), '→', (vmag*3.6).toFixed(0), 'km/h');
   ```
2. **Hit a calibration set** and record the honest `km/h`:
   - perfect-timed **flat** 1st serve (`L`),
   - perfect **kick** (`J`) and **slice** (`K`),
   - a **weak** 2nd serve.

   With the current constants (`SRV_SPEED.perfect = 34.5 m/s`, flat `ST.m`
   multiplier) a perfect flat serve lands around **120–145 km/h** — physically
   honest, but slower than a pro (≈190–210).
3. **Choose the display intent:**
   - **Honest (`BROADCAST_GAIN = 1.0`):** show the true simulated speed. Internally
     consistent with the ball you actually see.
   - **Broadcast-flattering (`BROADCAST_GAIN ≈ 1.35`):** scales a perfect flat serve
     to ~185–195 km/h to match TV expectations. Display-only — does **not** touch
     physics. Pick the gain so `perfect_flat_ms × 3.6 × gain ≈ 190`.
   - **Faster serves in-game:** if you'd rather the *ball* actually move pro-fast
     (not just the readout), raise `SRV_SPEED`/`DIFF.*.srv` in
     [constants.js](../js/constants.js) instead and keep gain at 1.0 — but that
     changes gameplay difficulty, so treat it as a separate tuning task.
4. **Lock it in.** Set `BROADCAST_GAIN` in [js/stats.js](../js/stats.js), remove the
   temporary `console.log`. `kmh()` is the single chokepoint, so the strip, the
   stats table, and the fastest/avg-serve rows all stay consistent automatically.

### Sanity checks
- Second serve should read ~12% slower than first (the `serveNum===2 ⇒ ×0.88`
  factor in [serve.js:229](../js/serve.js#L229)).
- Kick/slice read slower than flat (their `ST.m` < flat's).
- Fastest-serve in the end table should equal the highest single `vmag` you saw in
  the console during the match.

---

## 10. Open defaults (flag if you disagree)

1. **Rally mode collects no match-stats** — keeps its own best-rally HUD.
2. **Live strip flashes per-point** (~2.5s) rather than staying always-on, to keep
   the court clear during rallies.
3. **Landing map defaults to your shots, top-down, in the panels only** — the
   on-court overlay is opt-in (`Z` key).
4. **Timing/clean-strike is human-only** and excludes the AI doubles partner.
5. **Doubles shows all 4 players individually** (table + landing-map toggle);
   singles stays a 2-column team table.
6. **Serve speed defaults to honest (`BROADCAST_GAIN = 1.0`)** — flip to ~1.35 in
   calibration if you want pro-looking numbers (Section 11).
