# Avatar body & stroke-form fix plan

Four targeted fixes to the procedural avatar in [js/render.js](../js/render.js) (`drawChar`) and
the rig in [js/facing.js](../js/facing.js) (`bodyAnchors`). Each fix is independent; apply in any
order. All line numbers are from the current `main` working tree.

Rig recap: shoulders at y=1.45 (lat ±0.20), waist/hips at y=0.97 (lat ±0.13), lower hips
`hipBL/hipBR` at y=0.78 (lat ±0.16). Legs hang from the lower hips; the shorts panel spans
waist→lower-hip. Arms route shoulder → optional elbow (`ep`) → hand (`hp`), the racket shaft
runs `hp`→tip (`tp`). For the human, `dom=1` (right arm = dominant), `fwd=-1` (net is −z).
Two-handed backhand is flagged by `two = !fh && a.type === 'ground'`.

---

## Fix 1 — Legs connect fully and stay within torso width

**Problem:** the legs attach at `hipBL/hipBR` (lat ±0.16), which is *wider* than the waist
(±0.13). So the shorts flare out like a skirt and the legs splay wider than the torso instead
of meeting at the crotch.

**Change A — narrow the leg-attach anchors.** [js/facing.js:42](../js/facing.js#L42)

Before:
```js
    hipBL: at(-0.16, 0.78), hipBR: at(0.16, 0.78),
```
After:
```js
    hipBL: at(-0.11, 0.78), hipBR: at(0.11, 0.78),
```
Now the leg tops sit *inside* the waist (±0.13). With leg top half-width `wT = s*0.07`
(render.js:379), the two leg quads nearly touch at the centre → "connect completely", and the
shorts trapezoid tapers inward (shorts, not skirt).

**Change B — match the render fallback offsets.** [js/render.js:362-363](../js/render.js#L362-L363)

These fallbacks fire only if `proj` returns null, but keep them consistent with the rig.

Before:
```js
  const Lhb = PJ(A.hipBL,     lean*0.2, pf.x-s*0.16+lean*0.2, yAt(0.78));
  const Rhb = PJ(A.hipBR,     lean*0.2, pf.x+s*0.16+lean*0.2, yAt(0.78));
```
After:
```js
  const Lhb = PJ(A.hipBL,     lean*0.2, pf.x-s*0.11+lean*0.2, yAt(0.78));
  const Rhb = PJ(A.hipBR,     lean*0.2, pf.x+s*0.11+lean*0.2, yAt(0.78));
```

*Optional tuning:* if the planted feet still look too far apart, drop `STANCE_HALF` from `0.16`
to `0.14` at [js/facing.js:8](../js/facing.js#L8). Leave it unless the stance still reads wide
after Change A.

---

## Fix 4 — Forehand take-back (right arm) is too long

**Problem:** the forehand take-back hand sits at `sd*0.50` lateral with the tip at `sd*0.68` —
the arm reaches too far back/out.

**Change — shorten the take-back keyframes.** [js/render.js:472-474](../js/render.js#L472-L474)

Before:
```js
        const Kb  = [sd*0.50, 0.98, -fwd*0.32];
        const KbT = [sd*0.68, 0.80, -fwd*0.46];
        const KbE = [sd*0.42, 0.94, -fwd*0.18];
```
After:
```js
        const Kb  = [sd*0.38, 1.00, -fwd*0.30];
        const KbT = [sd*0.54, 0.86, -fwd*0.42];
        const KbE = [sd*0.30, 0.96, -fwd*0.16];
```
Only the take-back (`Kb/KbT/KbE`) shrinks; contact (`Kc*`) and follow-through (`Kf*`) are
unchanged, so the swing-through and finish keep their current reach.

---

## Fix 2 + Fix 3 — Groundstroke arm layering (both wings) + two-handed backhand elbows

**Problems:**
- **#2** Both arms are drawn together with a single front/back depth decision
  ([js/render.js:618](../js/render.js#L618)) keyed on the hand+tip average z. The racket tip swings
  that average across the threshold mid-swing, flipping the *whole* arm set front↔behind, so the
  crossing arm looks like it wraps around the back.
- **#3** On the two-handed backhand both arms route through the *same* elbow point `ep`, so the
  left arm bends through the right arm's elbow and doesn't read as a second hand on the grip.

**Goal — a fixed, explicit arm/body layer per groundstroke (right-handed convention; the NPC
mirrors via `dom`/`fwd`):**
- **Backhand:** **off (left) arm behind** the torso, **dominant (right) arm + racket in front**.
  Give the left arm **its own elbow** so both hands converge at `hp`.
- **Forehand:** **dominant (right) arm + racket behind** the torso, **off (left) arm in front**.
- Serves, smashes, volleys, and idle/anticipation keep the existing binary depth test.

This is a fixed layer for the whole stroke (not re-evaluated per phase) — that is the point: it
removes the mid-swing flip. The hitting hand is off to the contact side (`Kc` uses the ball's
lateral offset), so it is never hidden behind the narrow torso even when drawn in the rear layer.

This needs three edits: declare a second elbow, populate it in the backhand keyframes, and
restructure the bottom of `drawChar` to layer the arms around the body per wing.

### Change A — declare the off-arm elbow var. [js/render.js:430](../js/render.js#L430)

Before:
```js
  let H2, T, off = null, two = false, E = null, shoulderTurn = 0;
```
After:
```js
  let H2, T, off = null, two = false, E = null, Eo = null, shoulderTurn = 0;
```

### Change B — add off-arm elbow keyframes in the backhand branch. [js/render.js:499-524](../js/render.js#L499-L524)

Replace the entire backhand `else` block with this version (adds `KbEo/KcEo/KfEo` and assigns
`Eo` in the two swing phases, mirroring how `E` is handled):

```js
      } else {
        // Backhand: shoulder coil toward ball side, higher finish than before.
        const Kb  = [sd*0.40*rch, 0.96, -fwd*0.28];
        const KbT = [sd*0.62*rch, 1.02, -fwd*0.44];
        const KbE = [sd*0.34*rch, 0.88, -fwd*0.14];
        const Kc  = c ? [c[0]*0.60*rch, Math.max(0.78,c[1]-0.18), c[2]*0.60*rch] : [sd*0.52*rch, 1.00, fwd*0.40];
        const KcT = c ? c : [sd*1.0, 1.05, fwd*0.62];
        const KcE = [sd*0.32*rch, 0.88, fwd*0.18];
        const Kf  = [-sd*0.28*rch, 1.65, fwd*0.44];
        const KfT = [-sd*0.52, 1.84, fwd*0.30];
        const KfE = [-sd*0.10*rch, 1.46, fwd*0.32];
        // Off (left/top) hand elbow — tucked near the torso so the rear arm reads as a second
        // hand on the grip instead of routing through the dominant elbow.
        const KbEo = [sd*0.14*rch, 0.92, -fwd*0.06];
        const KcEo = [sd*0.12*rch, 0.96, fwd*0.06];
        const KfEo = [-sd*0.04*rch, 1.34, fwd*0.16];
        if (a.charging) {
          H2=Kb; T=KbT; shoulderTurn=sd*0.24;
        } else if (t<0.04) {
          H2=Kb; T=KbT; shoulderTurn=sd*0.24;
        } else if (t<0.10) {
          const u=(t-0.04)/0.06, uu=u*u;
          H2=KF(Kb,Kc,uu); T=KF(KbT,KcT,uu); E=KF(KbE,KcE,uu); Eo=KF(KbEo,KcEo,uu);
          shoulderTurn = lerp(sd*0.24, 0, uu);
        } else {
          const u=Math.min(1,(t-0.10)/0.55), uo=1-(1-u)*(1-u);
          H2=KF(Kc,Kf,uo); T=KF(KcT,KfT,uo); E=KF(KcE,KfE,uo); Eo=KF(KcEo,KfEo,uo);
          shoulderTurn = lerp(0, -sd*0.30, uo);
        }
        if (!two) off = [-sd*0.45, 1.25, fwd*0.25];
      }
```

### Change C — project the off-arm elbow. [js/render.js:544-545](../js/render.js#L544-L545)

After:
```js
  const ep = E ? proj(e.x+E[0], E[1], e.z+E[2]) : null;
  if (ep) ep.x += lean;
```
insert:
```js
  const epOff = Eo ? proj(e.x+Eo[0], Eo[1], e.z+Eo[2]) : null;
  if (epOff) epOff.x += lean;
```

### Change D — restructure the arm/body layering. [js/render.js:547-619](../js/render.js#L547-L619)

Replace the whole region — the `const drawArms = () => { … };` closure **and** the final
`if ((H2[2] + T[2]) / 2 < -0.06) { … } else { … }` dispatch (lines 547 through 619) — with the
block below.

What changed vs. the original:
- The arm primitives (`wSh/wEl/wHa`, `seg`, `joint`), the trail, the single-arm draw, the
  off-arm draw, and the racket draw are hoisted into named helpers.
- `drawArm(sx, sy, elb)` takes a **per-arm** elbow, so the off arm can use `epOff` and the
  dominant arm `ep`.
- New `bhTwo` (backhand) path: off arm → body → dom arm → racket — dominant (right) in front,
  off (left) behind, each with its own elbow.
- New `fhOne` (forehand) path: dom arm → racket → body → off arm — dominant (right) behind, off
  (left) in front.
- Serves/smashes/volleys/idle keep the original binary front/back behaviour unchanged.

```js
  const shL = Lsh, shR = Rsh;
  const domSh = dom > 0 ? shR : shL;
  const offSh = dom > 0 ? shL : shR;
  const wSh = Math.max(2, s*0.055), wEl = Math.max(1.8, s*0.05), wHa = Math.max(1.5, s*0.04);
  const seg = (ax, ay, bx, by, wa, wb) => {
    const dx = bx-ax, dy = by-ay, L = Math.hypot(dx,dy)||1, nx = -dy/L, ny = dx/L;
    ctx.beginPath();
    ctx.moveTo(ax+nx*wa, ay+ny*wa);
    ctx.lineTo(bx+nx*wb, by+ny*wb);
    ctx.lineTo(bx-nx*wb, by-ny*wb);
    ctx.lineTo(ax-nx*wa, ay-ny*wa);
    ctx.closePath(); ctx.fill();
  };
  const joint = (x, y, r) => { ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); };
  // One arm: shoulder -> [elbow] -> hand. `elb` is an optional screen-space elbow point.
  const drawArm = (sx, sy, elb) => {
    ctx.fillStyle = skin;
    joint(sx, sy, wSh);
    if (elb) { seg(sx,sy,elb.x,elb.y,wSh,wEl); joint(elb.x,elb.y,wEl); seg(elb.x,elb.y,hp.x,hp.y,wEl,wHa); }
    else seg(sx,sy,hp.x,hp.y,wSh,wHa);
  };
  const drawTrail = () => {
    if (a && a.t < 0.5) { (e._tt||(e._tt=[])).push({x:tp.x,y:tp.y}); if(e._tt.length>7)e._tt.shift(); }
    else if (e._tt && e._tt.length) e._tt.length = 0;
    if (e._tt && e._tt.length > 2) {
      ctx.strokeStyle = 'rgba(230,240,255,0.2)'; ctx.lineWidth = Math.max(2, s*0.1);
      ctx.beginPath(); ctx.moveTo(e._tt[0].x,e._tt[0].y);
      e._tt.forEach(q => ctx.lineTo(q.x,q.y)); ctx.stroke();
    }
  };
  const drawRacket = () => {
    const ang = Math.atan2(tp.y-hp.y, tp.x-hp.x);
    // Racket shaft
    ctx.strokeStyle = '#caa36a'; ctx.lineWidth = Math.max(1.5, tp.s*0.05);
    ctx.beginPath(); ctx.moveTo(hp.x,hp.y); ctx.lineTo(tp.x,tp.y); ctx.stroke();
    // Racket head: larger oval with string grid
    const hx = tp.x + Math.cos(ang)*tp.s*0.15, hy = tp.y + Math.sin(ang)*tp.s*0.15;
    const headRx = Math.max(3.5, tp.s*0.155), headRy = Math.max(2.2, tp.s*0.10);
    ctx.fillStyle = 'rgba(215,228,240,0.22)';
    ctx.strokeStyle = '#dfe8ef'; ctx.lineWidth = Math.max(1.5, tp.s*0.05);
    ctx.beginPath(); ctx.ellipse(hx,hy,headRx,headRy,ang,0,7); ctx.fill(); ctx.stroke();
    // String lines
    const perp = ang + Math.PI/2;
    const cxa = Math.cos(ang), cya = Math.sin(ang), cxp = Math.cos(perp), cyp = Math.sin(perp);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = Math.max(0.5, tp.s*0.018);
    for (let i = -1; i <= 1; i++) {
      const ox = cxp*i*headRy*0.48, oy = cyp*i*headRy*0.48;
      ctx.beginPath();
      ctx.moveTo(hx+ox-cxa*headRx*0.82, hy+oy-cya*headRx*0.82);
      ctx.lineTo(hx+ox+cxa*headRx*0.82, hy+oy+cya*headRx*0.82);
      ctx.stroke();
    }
    for (let i = -1; i <= 1; i++) {
      const ox = cxa*i*headRx*0.38, oy = cya*i*headRx*0.38;
      ctx.beginPath();
      ctx.moveTo(hx+ox-cxp*headRy*0.82, hy+oy-cyp*headRy*0.82);
      ctx.lineTo(hx+ox+cxp*headRy*0.82, hy+oy+cyp*headRy*0.82);
      ctx.stroke();
    }
  };

  // Off (non-racket) arm, shoulder -> hand at `off`. Used by the one-handed forehand.
  const drawOffArm = () => {
    if (!off) return;
    const op = proj(e.x+off[0], off[1], e.z+off[2]); if (!op) return;
    op.x += lean; ctx.fillStyle = skin;
    seg(offSh.x, offSh.y, op.x, op.y, wSh, wHa); joint(op.x, op.y, wHa);
  };

  const isGround = !!(a && a.type === 'ground');
  const bhTwo = isGround && two;    // two-handed backhand
  const fhOne = isGround && !two;   // one-handed forehand
  if (bhTwo) {
    // Backhand: off (left) arm behind torso, dominant (right) arm + racket in front.
    drawTrail();
    drawArm(offSh.x, offSh.y, epOff);   // rear (off/left) arm — behind the body
    drawBody();
    drawArm(domSh.x, domSh.y, ep);      // front (dominant/right) arm — in front
    ctx.fillStyle = skin; joint(hp.x, hp.y, wHa);
    drawRacket();
  } else if (fhOne) {
    // Forehand: dominant (right) arm + racket behind torso, off (left) arm in front.
    drawTrail();
    drawArm(domSh.x, domSh.y, ep);      // rear (dominant/right) arm — behind the body
    ctx.fillStyle = skin; joint(hp.x, hp.y, wHa);
    drawRacket();
    drawBody();
    drawOffArm();                       // front (off/left) arm — in front
  } else {
    // Serves, smashes, volleys, idle/anticipation — keep the original binary depth test.
    const drawArms = () => {
      drawTrail();
      if (two) {
        drawArm(shL.x, shL.y, ep); drawArm(shR.x, shR.y, ep);
        ctx.fillStyle = skin; joint(hp.x, hp.y, wHa);
      } else {
        drawArm(domSh.x, domSh.y, ep);
        ctx.fillStyle = skin; joint(hp.x, hp.y, wHa);
        drawOffArm();
      }
      drawRacket();
    };
    if ((H2[2] + T[2]) / 2 < -0.06) { drawArms(); drawBody(); }
    else { drawBody(); drawArms(); }
  }
```

**Notes / gotchas for the implementer:**
- `domSh`/`offSh` were previously declared *inside* `drawArms`; they now live at the outer scope
  (top of the replaced block). Make sure no duplicate `const domSh`/`offSh` remains below.
- `bhTwo`/`fhOne` only fire for `a.type === 'ground'`, so idle/ready and the `antSide`
  anticipation pose (no `a`) fall through to the original binary depth test.
- The fallback `if (!hp||!tp) { drawBody(); return; }` at
  [js/render.js:542](../js/render.js#L542) is above this block and stays as-is.

### Change E — straighten the arms at contact (matches the side-view reference)

A side-view reference of a two-handed backhand shows the shape the keyframes should hit:
**coil → load → racket-drop-below-ball → forward → arms EXTENDED at contact → elbows fold HIGH
on the finish.** The current keyframes already do low-to-high and a high finish, but they keep
the dominant elbow noticeably *bent at contact* — the reference shows both arms nearly straight
and reaching out front at contact, only folding afterward.

In the backhand block (the same block edited in Change B), reduce the contact-phase elbow bend
so the elbow sits close to the shoulder→hand line at contact, then let it fold on the
follow-through (which already happens via `KfE`/`KfEo`).

Before:
```js
        const KcE = [sd*0.32*rch, 0.88, fwd*0.18];
```
After:
```js
        const KcE = [sd*0.44*rch, 0.94, fwd*0.30];   // near-straight at extension; bend returns on the finish
```
And for the off elbow added in Change B:
```js
        const KcEo = [sd*0.12*rch, 0.96, fwd*0.06];
```
After:
```js
        const KcEo = [sd*0.30*rch, 0.98, fwd*0.30];  // off elbow tracks the extension, both hands together out front
```
These push the contact elbows out toward the hand/contact (more extension) while `KbE*` (coil,
tucked) and `KfE*` (high fold) keep the take-back compact and the finish folded. Tune visually:
if arms look hyperextended at contact, ease `KcE`/`KcEo` back toward the old values.

---

## Verification

No build step or tests cover rendering. Verify visually: open `index.html`, rally to exercise
both wings, and check:
1. Idle/running: legs meet at the crotch and are no wider than the torso; shorts taper inward.
2. Backhand (all phases): right arm reads in front of the chest, left arm behind it — no
   wrap-around, no mid-swing flip.
3. Backhand finish: both hands meet at the grip; the left forearm bends at its own elbow.
4. Forehand: right arm reads behind the torso, left (off) arm in front; the take-back is more
   compact; swing-through and finish reach are unchanged.

Confirm the existing Vitest suite still passes:
```
npx vitest run
```
- **Fix 1A is test-safe.** `test/unit/bodyAnchors.test.js` only makes *relative* assertions
  about `hipBL/hipBR` (turned vs. square, signs), not literal values, so ±0.16 → ±0.11 passes
  as-is. The stale `// -0.16 -> less negative` comment on line 42 can optionally be updated.
- **The optional `STANCE_HALF` tweak is NOT test-safe.** `test/unit/stance.test.js:55-59`
  asserts `STANCE_HALF ≈ 0.16` and `fa.dx/fb.dx ≈ ∓0.16`. Only change `STANCE_HALF` if you also
  update those three assertions; otherwise leave it at 0.16.
