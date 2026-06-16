# Touch Controls Plan — Court King

Make Court King fully playable on iPhone / iPad with two thumbs, without
changing the game engine. Touch is implemented as a **peer of `gamepad.js`**:
it synthesises the `keys` map and calls `startToss` / `strikeServe` /
`strokePress` exactly the way the keyboard and gamepad already do. The
charge → release timing mechanic works untouched because `updatePlayer`
releases a charge the instant `keys[charge.key]` goes false (player.js:75).

---

## 1. Control model

Two large **floating** (relative) zones — press anywhere, the control spawns
under your thumb, so there is no target to miss.

| Zone | Phase | Gesture | Maps to |
|------|-------|---------|---------|
| **Left** | live / point | drag | `keys.KeyW/A/S/D` (8-way) → move **and** aim-at-contact |
| **Left** | serve / toss | drag | absolute aim of `G.srvAim` inside the service box |
| **Right** | live | press → drag → **hold** → release | `strokePress(key)` + charge; `key` picked by flick wedge; release on lift |
| **Right** | serve | tap | `startToss(0)` |
| **Right** | toss | tap (sub-zone picks type) | `strikeServe('kick'\|'slice'\|'flat')` |
| Pause btn | any | tap | `openMenu` / `closeMenu` |

### Enable / disable (device gating)
- Touch only ever activates on a **touch-capable device** (`navigator.maxTouchPoints`
  / `(pointer: coarse)` / `ontouchstart`). Non-touch desktops never see it.
- A connected **gamepad auto-hides** the pads (e.g. iPad + controller) while in
  `auto` mode; the controller drives play via `gamepad.js`.
- The menu offers an explicit **Touch controls: On/Off** toggle on any
  touch-capable device (shown even when currently off, via `body.touch-capable`).
  The choice persists in `localStorage` (`ck_touchPref` = `auto|on|off`) and
  overrides auto-detection.

### Right-pad swing gesture (the core)

```
DOWN ──► drag to a wedge ──► HOLD (charge) ──► LIFT
 |            |                   |              |
 strokePress  latch shot type     charge.t grows release timing
 (default     (first time the     (power ring     judged at lift
  key)         drag crosses the    fills)          (= keyup)
               deadzone, then
               locked — drift ignored)
```

- **No flick** (thumb stays inside the deadzone) → the **default** shot
  (`KeyJ`, topspin) fires on release. Most rally balls are flick-free → clean
  charge+timing.
- A flick **latches once** when it first crosses the deadzone and never
  reassigns, so the final lift is a clean release, never a moving flick.
- Wedge anchors (angle, up = 90°): `KeyI` lob 90° · `KeyJ` topspin 135° ·
  `KeyK` slice 180° · `KeyL` flat 225° · `Semicolon` drop 270°. Nearest anchor wins.

### Serve type on touch

Serve strike must fire on **press** (to match keyboard `keydown` timing), so we
cannot read a drag. Instead the tap's vertical sub-zone on the right pad picks
the spin — fires immediately, all three serve types reachable:

```
top third  → kick   (high, safe)
mid third  → slice  (curves wide)
low third  → flat   (fastest)
```

### Why not a swipe / why two thumbs are enough

The engine never needs more than two simultaneous inputs (move + one stroke);
keyboard already binds shot type at `keydown` and never changes it, so
touch-down→hold→lift is a 1:1 map. A swipe (down-move-up, no dwell) cannot carry
the charge-hold, so the gesture is a **directional press-and-hold**, not a swipe.

---

## 2. UX mockups (every view that changes)

### A. Live rally (canvas overlay)
```
┌───────────────────────────────────────────────┐
│ You 6 4 · CPU 3            [⏸]                  │  ← score HUD (unchanged) + new pause btn
│                                                │
│                 o   ← ball                      │
│                /                                │
│              🎾  ring (timing, unchanged)       │
│        ___                                      │
│       (o_o)  player                             │
│                                                 │
│    · · · ·                        lob           │  ← rest hints fade out after first use
│   ·  ●→ ·                    top ╲ │ ╱  (charge  │
│   · MOVE ·                  slice ─●─ ring fills │  ← controls drawn ONLY while touched,
│    · · · ·                   flat ╱ │ ╲  drop)   │     translucent, at the thumb
│  left thumb                    SWING            │
└───────────────────────────────────────────────┘
```
- Left: origin ring + knob (clamped). Right: 5 wedge labels around the thumb,
  latched wedge highlighted, charge ring = `player.charge.t / CHARGE_FULL`.

### B. Serve / toss (canvas overlay)
```
┌───────────────────────────────────────────────┐
│                              [⏸]               │
│         ⊙ aim marker (G.srvAim, existing)       │
│        ·· service box ··                        │
│                                                 │
│        ___                                      │
│       (o_o) server                              │
│                                                 │
│   · · · ·                     ┌─ kick ─┐        │  ← right pad shows 3 serve
│   · AIM ·                     ├─ slice ┤        │     sub-zones at rest
│   · · · ·                     └─ flat ─┘        │
│  drag = place target          tap = toss/strike │
└───────────────────────────────────────────────┘
```
Hint text (servehint) switches to touch wording (see §3).

### C. Controls card (DOM, bottom-left) — touch section added
```
 CONTROLS              ⌨    👆            ← new touch column, shown on touch
 Move & aim      WASD   Left pad drag
 Topspin          J     Swing ↖
 Slice            K     Swing ←
 Flat             L     Swing ↙
 Lob              I     Swing ↑
 Drop             ;     Swing ↓
 Serve     J/K/L→toss   Right pad: tap toss → tap strike (↑kick ←slice ↓flat)
```

### D. Main menu instructions (.ctl) — touch paragraph added
```
 Touch: Left thumb pad = move & aim (hold a direction as you swing).
 Right thumb pad = swing: press-hold-release; flick toward a shot
 (↑ lob, ↖ topspin, ← slice, ↙ flat, ↓ drop), no flick = topspin.
 Serve: tap right pad to toss, tap again to strike (tap high=kick,
 middle=slice, low=flat). Aim the serve by dragging the left pad.
```

### E. Top help bar + pause button
- `#help` keyboard line hidden on touch; replaced by `[⏸] menu` tappable button
  (top-right, `pointer-events:auto`).

---

## 3. Files changed

| File | Change |
|------|--------|
| `js/touch.js` | **new** — pointer handlers, gesture state machine, pure geometry helpers |
| `js/state.js` | add `touch:{enabled,move,swing,hintT}`; `window.keys = keys` (for tests) |
| `js/constants.js` | add `TOUCH` constants (deadzone, radius, wedge anchors, default key) |
| `js/main.js` | `import './touch.js'` |
| `js/render.js` | `drawTouchUI()` called at end of `render()` |
| `js/serve.js` | serve-hint text branches on `G.touch.enabled` |
| `js/hud.js` | `showShot('Touch controls on')` when enabled |
| `index.html` | viewport `user-scalable=no`; controls-card touch column; menu touch line; `#touchPause` button |
| `css/style.css` | `#cv{touch-action:none}`; `body.touch` show/hide rules; pause button; touch column |

**Engine files untouched:** `player.js`, `ball.js`, `physics.js`, `npc.js`,
`scoring.js`, `match.js`, `camera.js`. Charge/timing model unchanged.

### Deferred (documented, not in v1)
- **Touch timing assist** (widening windows to offset latency / no-haptics on
  iOS Safari). Kept out so the shot-quality model and its unit tests stay
  identical. Follow-up: a `G.touch` flag scaling `PRESS_LEAD`/`QUAL` thresholds.
- Server can't reposition along the baseline on touch (left pad aims instead);
  stance stays at the default serve position.

---

## 4. TDD plan

Pure geometry is extracted into exported, DOM-free functions so they unit-test
without a browser; the gesture→engine wiring is covered by Playwright.

### Unit (vitest, `test/unit/touch.test.js`)
1. `vecToMoveKeys` — centre→none; right→KeyD; up→KeyW; up-left→KeyW+KeyA; down→KeyS.
2. `wedgeForVector` — deadzone→default `KeyJ`; up→`KeyI`; ↖→`KeyJ`; left→`KeyK`; ↙→`KeyL`; down→`Semicolon`.
3. `serveTypeForTap` — top→kick; middle→slice; bottom→flat.
4. `clientToLogical` — maps client px through a rect to logical W×H.

### E2E (Playwright, `test/e2e/touch.spec.js`)
Helper dispatches real `PointerEvent`s on `#cv`; force `G.touch.enabled`.
1. Enable touch → `G.touch.enabled` true, overlay renders, **no JS errors**, screenshot.
2. Left joystick drag → `window.keys.KeyD` true; release → false.
3. Touch serve: tap right pad (toss) → toss state; at apex tap (strike) → live (or fault retry).
4. Touch swing in a rally: incoming NPC ball, teleport into reach, press→flick→release → a `playerShot` is logged.

### Definition of done
`npm run test` (vitest) green **and** `npm run test:e2e` (Playwright) green,
including the existing suites (no regressions).
