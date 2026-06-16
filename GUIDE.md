# Court King — Complete Player & Systems Guide

> Every number, rule, and behaviour in this guide is taken directly from the game's
> source. File and line references are given so you can verify each claim. Nothing
> here is guesswork — if the code doesn't say it, it isn't in this guide.

---

## 1. How the game works (mechanics)

### 1.1 The world and coordinate system

The court is rendered semi-3D on a `960×600` canvas ([constants.js:1](js/constants.js#L1)).
Positions are 3D world coordinates:

| Axis | Meaning | Notes |
|------|---------|-------|
| `z` | length of court | Player side is `z > 0`, CPU side is `z < 0`, the net is at `z = 0` ([CLAUDE.md], [ball.js:56](js/ball.js#L56)) |
| `x` | lateral | positive = right from the player's view |
| `y` | height | `0` = ground |

Court dimensions ([constants.js:10](js/constants.js#L10)):

- `HL = 11.885` — half-length (baseline distance from net).
- `SW = 4.115` — singles half-width.
- `DW = 5.485` — doubles half-width.
- `SVC = 6.4` — service-box depth.
- Net height varies across its width: `0.92 + 0.16·min(1, |x|/5.2)` ([utils.js:7](js/utils.js#L7)) — **0.92 m at the centre, 1.08 m at the singles sideline and beyond.** Hitting through the low middle is always safer than over the higher edges.

The player (`0` = human) defends `z > 0`; the CPU (`1`) defends `z < 0`.

### 1.2 The game loop

`main.js` runs `requestAnimationFrame → update(dt) → render()`. `update` ticks camera, HUD,
toss, player, partner, NPCs and ball each frame; `render` projects 3D → 2D via the camera
([CLAUDE.md], [main.js:11-17](js/main.js#L11-L17)).

### 1.3 State machine

`G.state` cycles: `menu → serve → toss → live → point → serve …`
([state.js:2](js/state.js#L2), [serve.js](js/serve.js)). `G.mode` is `match` or `rally`;
`G.matchType` is `singles` or `doubles`.

### 1.4 Controls

Keyboard ([input.js](js/input.js)) and PS5-style gamepad ([gamepad.js](js/gamepad.js)) are
both supported. Press **H** to toggle the on-screen controls card ([input.js:24](js/input.js#L24)).

**Movement:** `W A S D` (left stick / D-pad on a pad).

**Serving (when you serve):**
- Hold **Shift + WASD** (or right stick) to aim the serve inside the service box ([player.js:54-62](js/player.js#L54-L62), [gamepad.js:52-61](js/gamepad.js#L52-L61)).
- Press **SPACE** or a **stroke key (J/K/L/I)** to start the ball toss ([input.js:27-32](js/input.js#L27-L32)).
- While the ball is in the air, press the stroke key again to strike — the key chooses the serve **type**: **J or I → kick (top-spin), K → slice, L → flat** ([input.js:30-34](js/input.js#L30-L34)).

**Rally strokes (when the ball is live):**

| Key | Gamepad (PS5) | Groundstroke | Volley (at net, no bounce) | Overhead (high, no bounce) |
|-----|---------------|--------------|----------------------------|----------------------------|
| **J** | ✕ | Top Spin | Top Spin Volley | Power Overhead |
| **K** | □ | Slice | Slice Volley | Slice Overhead |
| **L** | ○ | Flat Drive | Punch Volley | (defaults to overhead) |
| **I** | △ | Lob | Lob Volley | — |
| **;** | R1 | Drop Shot | Drop Volley | Touch Overhead |

([player.js:225-247](js/player.js#L225-L247), [gamepad.js:63-90](js/gamepad.js#L63-L90)).

**Aim while hitting:** the `A/D` keys held *at the moment of contact* steer the ball
laterally and `W/S` steer depth (see §2.4).

**Utility keys** ([input.js:17-26](js/input.js#L17-L26), gamepad in parentheses):
**M** mute (Create) · **Esc** pause/menu (Options) · **Tab** match-stats screen (L2) ·
**Z** on-court shot map (L1) · **H** toggle controls card · **G** download a JSON event log.

**Controller menu navigation:** whenever a menu or overlay is open, the **D-pad / left
stick** move a focus highlight between buttons, **✕** confirms, and **○** goes back
([gamepad.js](js/gamepad.js)). This drives the main menu, doubles pre-match screens, the
pause menu, and the stats screen (including its You/CPU, Zones %, and shot-type toggles).

### 1.5 The timing-ring system (the core skill)

When the CPU's ball is heading toward you, `simToPlane` forward-simulates the ball to your
`z` plane and writes the predicted contact `{t, x, y}` to `G.strike`
([physics.js:23-48](js/physics.js#L23-L48), [CLAUDE.md]). `t` is the time until the ball
reaches you. Your goal is to release your stroke so that `G.strike.t` equals
**`PRESS_LEAD = 0.10 s`** ([constants.js:25](js/constants.js#L25)) — i.e. you commit the
swing one tenth of a second before contact.

The timing **error** is `err = strike.t − 0.10`, and `|err|` maps to a quality tier
([player.js:195-196](js/player.js#L195-L196)):

| Tier | Charged-stroke window (`|err|`) | Label |
|------|-------------------------------|-------|
| **Perfect** | ≤ 0.05 s | `Perfect!` |
| **Good** | ≤ 0.12 s | `Good` |
| **OK** | ≤ 0.20 s | `OK` |
| **Mistimed (weak)** | > 0.20 s | `Mistimed` |

A **late** hit is punished harder than an early one: if `err < −0.05` (you swung after the
ideal point) the tier is bumped down one step ([player.js:196](js/player.js#L196)). A swing
is rejected entirely (`Too early`/`Too late`/`Out of reach`) if `|err| > 0.32` or the ball is
more than `1.6 m` lateral from you ([player.js:181](js/player.js#L181)).

### 1.6 The charge (power) mechanic

Groundstrokes use a **hold-and-release** charge. Pressing a stroke key starts a charge
(`p.charge`); the swing fires when you **release** the key ([player.js:113-135](js/player.js#L113-L135),
[player.js:156-210](js/player.js#L156-L210)).

- Charge time to full is `CHARGE_FULL = 0.5 s`. `power = clamp(holdTime / 0.5, 0, 1)` ([player.js:159](js/player.js#L159)).
- Power scales the shot speed by `lerp(0.62, 1.30, power)` — i.e. **62 % at a tap, up to 130 % fully charged** (`CHARGE_MIN_POW`, `CHARGE_MAX_POW`, [constants.js:28-29](js/constants.js#L28-L29), [player.js:313](js/player.js#L313)).
- If you hold the charge until the ball is already on top of you and in range, the game forces a badly-timed **"Panic!"** swing (`q = weak`, power ×0.4) ([player.js:77](js/player.js#L77), [player.js:163-177](js/player.js#L163-L177)). If you hold it while out of reach it auto-cancels with **"Out of reach."**

**Net play is different:** balls taken before the bounce while you're forward (`p.z < 8.5`,
`b.y ≤ 1.85`) use `instantHit` — no charge, a press-and-go volley with its own slightly
stricter timing windows (perfect ≤ 0.045, reject early if `err > 0.30`, late if `err < −0.13`)
([player.js:123](js/player.js#L123), [player.js:137-154](js/player.js#L137-L154)).

### 1.7 The sweet spot (body spacing)

Where the ball is relative to your body matters. The ideal lateral offset is
`SWEET_X = 0.45 m` to your hitting side ([utils.js:16-22](js/utils.js#L16-L22)). Contact more
than `0.25 m` away from that ideal applies a penalty `1 + (error − 0.25)·0.7` that multiplies
the shot's spray/noise. Jammed (ball into your body) or fully stretched contact = a worse,
less accurate shot.

---

## 2. Physics, rules and the shot error model

### 2.1 Ball flight

Each frame the ball integrates under gravity with spin-dependent gravity and air drag
([ball.js:43-78](js/ball.js#L43-L78)):

- Gravity: `g = 9.81 · (1 + 0.22·spin)` — **top-spin (`spin > 0`) falls faster, slice/back-spin (`spin < 0`) floats** ([ball.js:48](js/ball.js#L48), `GRAV` [constants.js:11](js/constants.js#L11)).
- Lateral curve: `vx += curve·dt` (used by slice/kick serves) ([ball.js:50](js/ball.js#L50)).
- Drag: `vx` and `vz` each ×`(1 − 0.045·dt)` per frame ([ball.js:51-52](js/ball.js#L51-L52)).

### 2.2 The bounce

On hitting the ground (`y ≤ 0`, falling), the bounce restitution and friction depend on spin
([ball.js:91-98](js/ball.js#L91-L98), mirrored in the predictors [physics.js:40-42](js/physics.js#L40-L42)):

| Spin | Vertical restitution `e` | Horizontal friction `fr` | Resulting kick |
|------|--------------------------|--------------------------|----------------|
| Top-spin (`> 0`) | 0.68 | 0.90 | bounces **higher and faster** forward |
| Flat (`0`) | 0.56 | 0.83 | medium |
| Slice (`< 0`) | 0.45 | 0.80 | **low, skidding** |

Spin decays to 35 % per bounce. A bounce slower than `vy < 0.55` is treated as a dead ball
([ball.js:97](js/ball.js#L97)).

### 2.3 The net

If the ball crosses `z = 0` below the local net height it clips the cord: it's killed to a
small dribble, `netHit` is flagged, and a net sound plays ([ball.js:56-67](js/ball.js#L56-L67)).
A net-clip during a rally ends the point against the hitter ([ball.js:134](js/ball.js#L134)).

### 2.4 Point rules (`groundEvent`)

All point logic lives in `groundEvent` ([ball.js:100-145](js/ball.js#L100-L145)). The
in/out boundary uses `halfW = DW` in doubles, `SW` in singles, with a `0.07 m` tolerance
([ball.js:114-115](js/ball.js#L114-L115)):

- **Serve (first bounce, `isServe`):** must land in the correct service box (`serveBoxOK`, [ball.js:80-89](js/ball.js#L80-L89)) or it's a **fault** ([ball.js:120-130](js/ball.js#L120-L130)).
- **Net-clip in rally:** point to the other side ("Net!"/"CPU nets it") ([ball.js:134](js/ball.js#L134)).
- **Bounces on the hitter's own side:** point against them ("Net!") ([ball.js:135](js/ball.js#L135)).
- **Lands out of court:** point against the hitter ("Out!") ([ball.js:136](js/ball.js#L136)).
- **Lands in:** rally continues; on the **second** bounce the last hitter wins the point ("Winner!") ([ball.js:138-142](js/ball.js#L138-L142)).

### 2.5 The shot-type error model (why shots miss)

When you hit, your aim target `(tx, tz)` starts from the stroke's base depth plus your
directional input, then noise is added based on **timing quality, shot type, and how far you
had to lunge** ([player.js:253-312](js/player.js#L253-L312)). This is the heart of the skill
ceiling.

**Aim inputs at contact** ([player.js:220-258](js/player.js#L220-L258)):
- Lateral: `tx = (D − A) · aimReach`, where `aimReach` = 2.9 (singles), 3.4 (doubles), or **4.8 (doubles, well-timed)**.
- Depth: `S` (depth `< 0`) aims **deeper** (`tz −= 2.3`); `W` (depth `> 0`) aims **shorter** (`tz += 1.4`).

**Lunge** = `min(1, distance/1.4)` — how stretched you were ([player.js:259](js/player.js#L259)). Spray scales with `lunge²`, so stretching is punished sharply.

The noise is shaped per shot type ([player.js:262-312](js/player.js#L262-L312)):

- **Flat / smash (`isFlat`):** spray laterally and in depth at *any* timing, scaled by quality noise. They can fly **wide, long, or into the net** — high reward, high risk. Out-risk `shankP = Q.shank·penalty + 0.12·lunge²·Q.noise`.
- **Spin / touch (top-spin, slice, drop, volley):** tiny lateral wobble (never sprays wide on good/ok timing); instead they **lose depth and float short** as timing/lunge worsen. They only truly miss (net/long/wide) on a **weak (mistimed)** hit — `shankP = 0.55·penalty` ([player.js:304-311](js/player.js#L304-L311)).
- **Lob:** *charge sets depth* (`lerp(−6.8, −12.7, power)`), *timing sets the out-vs-short outcome* (depth error 0.25 → 2.4 by tier) ([player.js:268-273](js/player.js#L268-L273)).

The timing tier (`QUAL`, [constants.js:18-23](js/constants.js#L18-L23)) drives everything:

| Tier | Power `pow` | Noise mult | Net-clear mult `clr` | Base shank | Recovery `rec` |
|------|------------|-----------|----------------------|-----------|----------------|
| Perfect | 1.06 | 0.55 | 1.00 | 0 | 0.22 s |
| Good | 1.00 | 1.00 | 1.00 | 0.03 | 0.30 s |
| OK | 0.90 | 2.00 | 0.68 | 0.12 | 0.40 s |
| Weak | 0.74 | 3.20 | 0.34 | 0.30 | 0.52 s |

So a **Perfect** shot is faster, far more accurate (noise ×0.55), clears the net with full
margin, never shanks, and you recover fastest. A **Weak** shot is slow, sprays ~6× more,
barely clears the net, and leaves you flat-footed.

### 2.6 Per-shot base values

Groundstrokes (after a bounce) ([player.js:242-246](js/player.js#L242-L246)):

| Key | Shot | Spin | Speed | Net clear | Base depth `tz` | Tolerance |
|-----|------|------|-------|-----------|-----------------|-----------|
| J | Top Spin | +1 | 23.5 | 0.78 | −9.7 | 0.7 |
| K | Slice | −1 | 16.5 | 1.05 | −9.4 | 0.95 |
| L | Flat Drive | 0 | 27 | 0.42 | −10.0 | **1.5** |
| I | Lob | 0 | 12.5 | 3.1 | −10.2 | 1.0 |
| ; | Drop Shot | −1 | 9.5 | 0.35 | −3.3 | 1.15 |

`shotTol` multiplies the noise — flat's 1.5 makes it the riskiest, top-spin's 0.7 the
safest in terms of lateral spread ([player.js:281](js/player.js#L281)). Low contact
(`b.y < 0.35`) costs 14 % speed and adds net clearance ([player.js:316](js/player.js#L316)).

---

## 3. How the NPC (CPU) thinks

The singles AI lives in `updateNPC` ([npc.js:23-145](js/npc.js#L23-L145)) and `npcHit`
([npc.js:147-239](js/npc.js#L147-L239)). Every behaviour is parameterised by the difficulty
config `DIFF[G.diffKey]` ([constants.js:13-17](js/constants.js#L13-L17)).

### 3.1 Reaction and pathfinding

1. **React delay:** after you hit, the NPC waits `react` seconds before forming a plan (`n.reactT`, set in [ball.js:21](js/ball.js#L21)).
2. **Predict the path:** `predictPath` simulates the incoming ball; the NPC scans it for the first *comfortable* intercept (a waist-high ball after the bounce it can reach in time), else any feasible point, else the least-bad stretch ([npc.js:58-79](js/npc.js#L58-L79)). "Reachable" is judged against its movement `speed` ([npc.js:67](js/npc.js#L67)).
3. **Smash detection:** if a high, reachable ball exists it plans an overhead ([npc.js:68](js/npc.js#L68)).
4. **Let-it-go:** if `predictLanding` says your ball is sailing out, the NPC *holds position* and lets it land out instead of returning it (`ballHeadingOut`, [npc.js:12-21](js/npc.js#L12-L21)).
5. **Lob tracking:** for a high lob it re-predicts the landing each frame so it doesn't end up a step behind ([npc.js:91-95](js/npc.js#L91-L95)).

### 3.2 Hitting and shot choice

The NPC swings when the ball is within reach and its swing animation has passed a timing
gate ([npc.js:127-144](js/npc.js#L127-L144)). It may **whiff** entirely with probability
`whiff` ([npc.js:141](js/npc.js#L141)). Its shot is chosen from the **court situation**, not a
flat dice roll ([npc.js:157-171](js/npc.js#L157-L171)):

- You at net → 55 % chance it **lobs** you, otherwise a dipping flat **pass**.
- You pinned deep + it has time → 35 % chance of a **drop shot**.
- It gets a **sitter** (high, short, no stretch) → 60 % chance it flattens out a winner.
- Low ball or stretched → **slice** to stay low and reset.
- Otherwise → **top-spin** rally ball.

### 3.3 Where the NPC aims (`aimMix`)

Each shot picks an aim mode from a weighted mix per difficulty ([npc.js:174-196](js/npc.js#L174-L196), `aimMix` in [constants.js:14-16](js/constants.js#L14-L16)):

- **wide** — into an open corner away from you.
- **wrongFoot** — back behind your direction of movement (only if you're actually moving/off-centre, else it falls back to wide).
- **deepMiddle** — deep down the centre.
- **chasePlayer** — *toward* you (easy AI does this a lot, keeping the ball hittable).
- **random** — anywhere.

Then a **forced error** is rolled at probability `err` (halved in rally mode), pushing the
target wide/long/net ([npc.js:198-204](js/npc.js#L198-L204)), plus gaussian body/stretch
noise ([npc.js:205-214](js/npc.js#L205-L214)).

### 3.4 Net approach and memory

After a deep shot the NPC may follow it to the net with probability `appr` (+0.25 if it was
pulled in short) ([npc.js:235](js/npc.js#L235)). It remembers where you serve
(`G.npcMem.serve`) and the running average of where you hit (`G.npcMem.rallyX`) to position
its return and recovery ([ball.js:122-133](js/ball.js#L122-L133), [npc.js:106](js/npc.js#L106)).
On the serve return it stands wider/closer based on difficulty (`retDepth`) and adapts its
return position to your serve history ([serve.js:35-53](js/serve.js#L35-L53)).

---

## 4. Difficulty: what Easy, Medium and Hard actually do

All differences come from one table ([constants.js:13-17](js/constants.js#L13-L17)). Higher =
harder for you.

| Parameter | Easy | Medium | Hard | What it controls |
|-----------|------|--------|------|------------------|
| `speed` | 4.0 | 5.2 | 6.0 | NPC movement speed (m/s). Hard covers the court ~50 % faster than Easy ([npc.js:110](js/npc.js#L110)). |
| `react` | 0.42 | 0.24 | 0.10 | Reaction delay (s) before it chases. Easy is sluggish; Hard is nearly instant ([ball.js:21](js/ball.js#L21)). |
| `err` | 0.20 | 0.11 | 0.05 | Per-shot forced-error chance. Easy misses 1 in 5; Hard 1 in 20 ([npc.js:198-200](js/npc.js#L198-L200)). |
| `whiff` | 0.05 | 0.015 | 0.0 | Chance it completely misses a reachable ball. Hard **never** whiffs ([npc.js:141](js/npc.js#L141)). |
| `pace` | 18.5 | 23.5 | 28.5 | Base shot speed. Hard hits ~54 % harder than Easy ([npc.js:152](js/npc.js#L152)). |
| `srv` | 24 | 30 | 35.5 | Serve speed ([serve.js:233](js/serve.js#L233)). |
| `srvNoise` | 0.75 | 0.55 | 0.40 | Serve placement scatter — Easy serves are loose, Hard are tight ([serve.js:234](js/serve.js#L234)). |
| `open` | 0.0 | 0.5 | 1.0 | Chance the serve goes for the corners of the box. Easy never aims the lines; Hard always can ([serve.js:241](js/serve.js#L241)). |
| `appr` | 0.06 | 0.40 | 0.75 | Net-approach frequency after a deep shot. Hard storms the net ([npc.js:235](js/npc.js#L235)). |
| `tossErr` | 0.07 | 0.04 | 0.02 | Serve-toss timing scatter, so Hard's serve quality is more consistent ([npc.js:35](js/npc.js#L35)). |
| `retDepth` | 0.2 | 0.7 | 1.0 | How far back it stands to return serve ([serve.js:49](js/serve.js#L49)). |
| `aimMix` | mostly **chasePlayer** (0.70) | balanced, more **wide** (0.35) | aggressive: **wide 0.45, wrongFoot 0.25**, no chasePlayer | Targeting bias (§3.3). |

**Plain-English summary of each opponent:**

- **Easy** — slow to react (0.42 s) and slow to move (4.0). Hits softly (pace 18.5), and 70 % of the time aims *at you* so the ball stays playable; only 5 % corner serves and a 5 % outright whiff. Forgiving practice partner.
- **Medium** — competent. Reacts in 0.24 s, moves at 5.2, hits with real pace (23.5), mixes serves to the corners half the time, and comes to net 40 % of the time after a deep ball. Aims to move you around (35 % wide) but still feeds you some balls.
- **Hard** — relentless. Near-instant 0.10 s reaction, fastest movement (6.0), hits hardest (28.5), tightest serves with full corner targeting, never whiffs, only 5 % unforced errors, and approaches the net 75 % of the time. Its aim is purely offensive — 45 % wide, 25 % wrong-footing, and **zero** balls fed back to you.

Difficulty also subtly scales how strongly the NPC adapts its serve-return position to your
serve history: `adapt` = 0.35 / 0.55 / 0.75 for easy/medium/hard ([serve.js:46](js/serve.js#L46)).

---

## 5. Doubles (2 v 2)

Doubles is enabled from the menu, which seeds a fixed serve rotation and creates the two
extra AI entities ([menu.js:146-156](js/menu.js#L146-L156)). There are four entities, indexed
for AI decisions as **0 = you, 1 = your AI partner, 2 = CPU, 3 = CPU2**
([state.js:20-33](js/state.js#L20-L33)).

### 5.1 Court and rules changes

- The court is **wider**: in/out and serve placement use `DW = 5.485` instead of `SW` ([ball.js:114](js/ball.js#L114)).
- Your own shots can be aimed wider — `aimReach` is 3.4 (or **4.8 when well-timed**) versus 2.9 in singles ([player.js:255-257](js/player.js#L255-L257)).

### 5.2 Serve and receive rotation

The serve order is `[0,2,1,3]` (you serve first) or `[2,0,3,1]` (decided by a coin toss),
cycling one entity per game ([menu.js:148](js/menu.js#L148), [scoring.js:51-63](js/scoring.js#L51-L63)).
Each side has a fixed deuce-court and ad-court receiver for the set
(`receiveHuman`/`receiveCpu`, [menu.js:150-151](js/menu.js#L150-L151)).

At serve setup ([serve.js:79-193](js/serve.js#L79-L193)) the four players are arranged
realistically: the **server** at the baseline, the **server's partner at the net**, the
**designated receiver** back, and the **receiver's partner near the service line**.

**No-poach rule on the return:** only the designated receiver may play the serve return — both
the human net partner and the AI follow this. If you try to return when it isn't your ball you
get *"Let your partner return"* ([player.js:120-122](js/player.js#L120-L122), [npc.js:256-258](js/npc.js#L256-L258)).

### 5.3 Who hits the ball (CPU team)

Each frame, `pickCpuHitter` designates exactly one CPU as the hitter
([npc.js:252-278](js/npc.js#L252-L278)):

- The ball's predicted landing decides which lateral **half** it's in; the player whose `homeSide` owns that half is the default hitter.
- The partner only **poaches** if it is clearly closer (more than `1.4 m` advantage).
- **Hysteresis** keeps the current hitter unless the other gains a big lead, preventing both players from swapping indecisively ([npc.js:271-276](js/npc.js#L271-L276)).

The non-hitter does **triangle positioning**: it holds its own half and shifts as a unit
toward the ball, covering net (`z = −2.7`) or baseline (`z = −10.8`) depending on whether it's
in net mode ([npc.js:315-329](js/npc.js#L315-L329)). A net player only tries to intercept a
ball on its own side ([npc.js:332-341](js/npc.js#L332-L341)).

### 5.4 CPU doubles shot selection

`cpuHit` ([npc.js:366-441](js/npc.js#L366-L441)) adds **open-court aiming**: it scans lateral
candidates `[−3.6, −1.8, 0, 1.8, 3.6]` and fires into the gap **least covered** by you and
your partner ([npc.js:382-388](js/npc.js#L382-L388)). 25 % of the time it instead **body-shots
or wrong-foots** a moving opponent ([npc.js:391-395](js/npc.js#L391-L395)), and 20 % it lobs if
someone is at the net ([npc.js:398-401](js/npc.js#L398-L401)). After a volley/smash or a deep
approach it moves to the net and recovers toward its own home side.

### 5.5 Your AI partner

`updatePartner` ([npc.js:523-640](js/npc.js#L523-L640)) mirrors the CPU logic for your team:

- On the **serve return** it only hits if it is the designated receiver; otherwise it holds near the service line until the ball clears ([npc.js:548-554](js/npc.js#L548-L554), [npc.js:578-582](js/npc.js#L578-L582)).
- In rallies it covers **its own lateral half** (`ballSide === homeSide`) and lets you take the other ([npc.js:555](js/npc.js#L555)).
- When hitting, `partnerHit` aims into the largest gap between the two CPUs, with mostly top-spin ([npc.js:616-640](js/npc.js#L616-L640)). It moves at 90 % of the difficulty speed ([npc.js:587](js/npc.js#L587)).

**Practical takeaway:** in doubles you are responsible for **your half**. Cover wide balls on
your side, let your partner take theirs, and don't poach the return — the engine will reject
it. Come to the net behind your serves; the wider court rewards angled, well-timed shots
(the 4.8 m aim reach).

---

## 6. A new player's path to improvement (step-by-step)

Every tip below maps to a specific mechanic above.

### Step 1 — Learn the rhythm (Rally mode, Easy)
Start in **Rally mode** so faults just re-serve and you can groove the timing
([serve.js:291-294](js/serve.js#L291-L294)). Watch the timing ring and aim to release the
stroke so the call reads **Perfect** (`|err| ≤ 0.05`). Because late hits are downgraded
([player.js:196](js/player.js#L196)), err on the side of **slightly early**.

### Step 2 — Master the charge
Hold the stroke key to build power, release to fire. A **tap ≈ 62 %** speed, a **full 0.5 s
hold = 130 %** ([player.js:159](js/player.js#L159), [player.js:313](js/player.js#L313)). Never
hold so long the ball arrives first — that triggers a weak **"Panic!"** swing
([player.js:163-177](js/player.js#L163-L177)). Practice: charge fully on slow balls, tap on
fast ones.

### Step 3 — Find the sweet spot
Move your feet so the ball sits about **0.45 m to your hitting side**, not into your body
([utils.js:16-22](js/utils.js#L16-L22)). Contact outside the `0.25 m` window multiplies your
spray. Most "I timed it but it flew out" misses are bad spacing, not bad timing.

### Step 4 — Use the right shot for the situation
- **Top-spin (J)** is your safe rally shot — lowest lateral spray (`tol 0.7`), dips into court, and kicks high off the bounce ([player.js:242](js/player.js#L242), [ball.js:92](js/ball.js#L92)).
- **Flat (L)** is your weapon — fastest (27) but riskiest (`tol 1.5`) and sprays even on decent timing. Only flatten out a **short, high sitter** ([player.js:244](js/player.js#L244), §2.5).
- **Slice (K)** stays low and skids — great for defence and approach shots ([ball.js:93](js/ball.js#L93)).
- **Lob (I)** when the CPU is at the net — charge = depth, timing = whether it lands in ([player.js:268-273](js/player.js#L268-L273)).
- **Drop shot (;)** when the CPU is pinned deep — but note it's penalised if you hit it from your own baseline ([player.js:246](js/player.js#L246)).

### Step 5 — Aim on purpose
Hold `A`/`D` *at contact* to direct the ball wide; hold `S` to hit **deeper**, `W` to hit
**shorter** ([player.js:220-258](js/player.js#L220-L258)). Move the CPU corner-to-corner — its
recovery position lags toward where you've been hitting (`rallyX`), so changing direction
catches it out ([npc.js:106](js/npc.js#L106)).

### Step 6 — Serve with intent
Aim with **Shift+WASD** into the service box. The **flat serve** is fastest but faults often
on poor timing (`fault` up to 0.85 when weak); the **kick serve** almost never faults
(`fault` ≈ 0 except 0.25 on a weak toss) — use kick as a reliable second serve
([constants.js:30-34](js/constants.js#L30-L34), [serve.js:226](js/serve.js#L226)). Serve
quality follows the same toss-timing tiers, and second serves are slower (×0.88) but safer
([serve.js:229](js/serve.js#L229)).

### Step 7 — Exploit recovery windows
A **Perfect** shot recovers in 0.22 s; a **Weak** one leaves you stuck for 0.52 s
([constants.js:19-22](js/constants.js#L19-L22), [player.js:331](js/player.js#L331)). Clean
timing literally lets you reach the next ball — sloppy timing compounds into being late on the
follow-up.

### Step 8 — Climb the difficulty
- **Beat Easy** by simply keeping the ball in — it feeds you playable balls (chasePlayer 0.70) and whiffs 5 % of the time.
- **Beat Medium** by moving it wide and coming forward; it errs 11 % and approaches the net 40 % — pass it or lob it.
- **Beat Hard** with first-strike tennis: it has no reaction lag (0.10 s) and never whiffs, so rallying it out rarely works. Serve big, take the ball early, hit behind it (wrong-foot), and finish short balls with flat drives before it sets up. It approaches 75 % of the time — the **lob (I)** and the dipping pass are your best answers.

---

## 7. Match stats, live HUD & shot map

In match mode the game records a running stat line and a shot-placement log
([stats.js](js/stats.js), fed once per point from [match.js `endPoint`](js/match.js)).
Rally mode keeps only its own best-rally HUD — no match stats.

**What's tracked** ([stats.js `ingestPoint`](js/stats.js)): points won, aces (unreturned
serves), double faults, 1st-serve in %, 1st/2nd-serve points won %, fastest & average serve,
winners, unforced errors, longest/average rally, current streak, your timing-grade mix
(clean-strike %), and every shot's landing `{x, z, in, serve, kind, fore}`. In **doubles**
each of the four players gets a dedicated line — serves attribute to the server, winners/
errors to the player who hit the point-ending shot.

**Serve speed** is physically derived: the world is in real metres/seconds, so a serve's
velocity vector is m/s, shown as `km/h = |v| · 3.6 · 1.45`. The `1.45` is a display-only
broadcast gain that scales a perfect flat serve (~36 m/s) to a pro-like ~190 km/h; it does
not affect physics ([stats.js `kmh`/`BROADCAST_GAIN`](js/stats.js), [ball.js](js/ball.js)
and [serve.js](js/serve.js) log the velocity).

**Live strip** (top-right, [hud.js `flashLiveStats`](js/hud.js)): a persistent broadcast
lower-third — last serve speed, rally length, your winners–unforced tally, and any streak.
It updates when the next point ends and hides when you open a menu; it does not fade on a
timer.

**Stats screen** (`Tab` / `L2`, or the pause-menu *Match Stats* button): a You-vs-CPU table
(four-player table in doubles) beside a top-down **shot-placement chart**. The chart:

- dots are coloured **forehand (orange) / backhand (blue)**; serves are neutral grey; out
  balls are ringed red. Wing is logged for every shot, players and CPU alike ([ball.js](js/ball.js)).
- **shot-type filter** chips — *Serves · Ground · Volleys · Lobs* — toggle which shots show.
- **You / CPU** (and Partner / CPU 1 / CPU 2 in doubles) switches whose shots are shown.
- **Zones %** overlays the broadcast left/middle/right thirds with the % of shots landing in
  each. The court renders at device-pixel-ratio for crispness.

**On-court shot map** (`Z` / `L1`, [render.js](js/render.js)): overlays your accumulated
landings directly on the live court in the same FH/BH colours; off by default.

---

## 8. Quick reference card

| Thing | Value | Source |
|-------|-------|--------|
| Ideal timing lead | 0.10 s | [constants.js:25](js/constants.js#L25) |
| Perfect / Good / OK windows | ≤0.05 / ≤0.12 / ≤0.20 s | [player.js:195](js/player.js#L195) |
| Full charge time | 0.5 s | [constants.js:27](js/constants.js#L27) |
| Power range (tap→full) | 62 % → 130 % | [constants.js:28-29](js/constants.js#L28-L29) |
| Sweet-spot offset / tolerance | 0.45 m / ±0.25 m | [utils.js:16-21](js/utils.js#L16-L21) |
| Net height (centre→post) | 0.92 → 1.08 m | [utils.js:7](js/utils.js#L7) |
| Player top speed | 5.2 m/s | [player.js:22](js/player.js#L22) |
| Singles / doubles half-width | 4.115 / 5.485 m | [constants.js:10](js/constants.js#L10) |
| Win condition | best of 3 sets | [match.js:62-64](js/match.js#L62-L64) |

---

*Generated by reading the source directly. To regenerate the event log for your own match,
press **G** in-game to download a JSON of every shot, bounce, and decision
([input.js:23](js/input.js#L23)).*
