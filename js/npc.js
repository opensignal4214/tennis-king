import { DIFF, TOSS_APEX } from './constants.js';
import { G } from './state.js';
import { clamp, rnd, gauss, tossY, bodyContactPenalty } from './utils.js';
import { hitBall } from './ball.js';
import { startToss, fireServe } from './serve.js';
import { servingPlayer } from './scoring.js';
import { predictLanding, simBallToNpcZ, predictPath } from './physics.js';
import { logEvent } from './logger.js';

export function updateNPC(dt) {
  const n = G.npc, b = G.ball, d = DIFF[G.diffKey];
  n.cool -= dt; n.recover = (n.recover || 0) - dt;
  if (n.anim) { n.anim.t += dt; if (n.anim.t > 0.7) n.anim = null; }

  if (G.state === 'serve' && servingPlayer() === 1) {
    G.serveT -= dt;
    if (G.serveT <= 0) { startToss(1); }
    return;
  }
  if (G.state === 'toss' && G.toss && G.toss.by === 1) {
    if (!G.toss.strikeAt) G.toss.strikeAt = TOSS_APEX + gauss() * d.tossErr;
    if (G.toss.t >= G.toss.strikeAt) {
      const err = Math.abs(G.toss.t - TOSS_APEX);
      const q = err <= 0.045 ? 'perfect' : err <= 0.10 ? 'good' : err <= 0.18 ? 'ok' : 'weak';
      G.toss.hit = true;
      fireServe(1, q, tossY(G.toss.t));
    }
    return;
  }
  if (G.state !== 'live') return;

  if (b.lastHitter === 0) {
    const dxa = b.x - n.x;
    if (!n.antSide) n.antSide = dxa >= 0 ? 1 : -1;
    else if (n.antSide === 1 && dxa < -0.35) n.antSide = -1;
    else if (n.antSide === -1 && dxa > 0.35) n.antSide = 1;
    if (n.reactT > 0) { n.reactT -= dt; }
    else if (!n.plan) {
      const L = predictLanding();
      if (L && L.z < -8.0) n.netMode = false;
      // A lob climbs high and slow — track it over a longer horizon and drop off the net so
      // the NPC chases deep lobs (or steps under short ones) instead of losing the ball.
      const lobbed = b.vy > 6 || b.y > 3.2;
      if (lobbed) n.netMode = false;
      // Pick the earliest point on the ball's path the NPC can actually reach in time.
      const path = predictPath(lobbed ? 5.0 : 2.4);
      let comfort = null, feasibleAny = null, stretch = null, smash = null, minDef = Infinity;
      for (const s of path) {
        if (s.z > -0.9 || s.z < -15) continue;
        const reach = Math.hypot(s.x - n.x, s.z - n.z);
        const deficit = reach - d.speed * Math.max(0.01, s.t - 0.08);
        // Overhead: get under a still-airborne, descending ball at smash height and punish the lob.
        if (!s.bounced && s.y >= 1.9 && s.y <= 3.0 && deficit <= 0 && !smash) smash = s;
        if (s.y > 2.6) continue;
        if (deficit <= 0) {
          if (!feasibleAny) feasibleAny = s;
          if (s.bounced && s.y >= 0.4 && s.y <= 1.7) { comfort = s; break; }
        }
        if (deficit < minDef) { minDef = deficit; stretch = s; }
      }
      const pick = smash || comfort || feasibleAny || stretch;
      if (pick) n.plan = { x: clamp(pick.x, -7.5, 7.5), z: clamp(pick.z, -15, -0.9) };
      else if (L && L.z < 0.5) n.plan = { x: clamp(L.x, -7.5, 7.5), z: clamp(L.z - 1.25, -15, -0.9) };
      else n.plan = { x: n.x, z: n.z };
      logEvent('npcPlan', {
        predicted: L ?? null, plan: { ...n.plan },
        feasible: !!(comfort || feasibleAny), lob: lobbed, overhead: !!smash,
        deficit: (comfort || feasibleAny) ? 0 : (isFinite(minDef) ? minDef : null),
      });
    }
    if (n.plan) {
      if (b.bounces > 0) {
        n.tgt = { x: clamp(b.x + b.vx * 0.13, -7.5, 7.5), z: clamp(Math.min(b.z - 0.9, -0.8), -15, -0.8) };
      } else if (n.netMode && !b.isServe && b.bounces === 0) {
        const ic = simBallToNpcZ(-2.8);
        if (ic) n.tgt = { x: clamp(ic.x, -4.6, 4.6), z: -2.8 };
        else n.tgt = n.plan;
      } else n.tgt = n.plan;
    }
  } else {
    n.antSide = 0;
    n.tgt = n.netMode
      ? { x: (typeof n.netX === 'number' ? n.netX : clamp(b.x * 0.3, -2.6, 2.6)), z: -2.7 }
      : { x: (typeof n.recoverX === 'number' ? n.recoverX : clamp(b.x * 0.2 + G.npcMem.rallyX * 0.35, -3.2, 3.2)), z: -11.7 };
  }

  const dx = n.tgt.x - n.x, dz = n.tgt.z - n.z, dist = Math.hypot(dx, dz);
  let maxSp = d.speed, accel = 13 * (d.speed / 5.2);
  if (n.recover > 0) { accel *= 0.25; maxSp *= 0.55; }
  else if (n.anim) { accel *= 0.35; }
  let desx = 0, desz = 0;
  if (dist > 0.08) { const sp2 = Math.min(maxSp, dist * 3.5); desx = dx / dist * sp2; desz = dz / dist * sp2; }
  if (desz < -0.1 && !(b.isServe && b.lastHitter === 0)) {
    n.backT = (n.backT || 0) + dt; const turned = n.backT > 0.6;
    accel *= turned ? 0.7 : 0.5;
    const cap = maxSp * (turned ? 0.8 : 0.55), dl = Math.hypot(desx, desz);
    if (dl > cap) { desx *= cap / dl; desz *= cap / dl; }
  } else n.backT = 0;
  n.vx = (n.vx || 0) + clamp(desx - (n.vx || 0), -accel * dt, accel * dt);
  n.vz = (n.vz || 0) + clamp(desz - (n.vz || 0), -accel * dt, accel * dt);
  n.x += n.vx * dt; n.z += n.vz * dt;
  n.spd = Math.hypot(n.vx, n.vz); n.lvx = n.vx;
  n.stride = (n.stride || 0) + n.spd * dt * 3.1;

  if (b.lastHitter === 0 && !b.isServe && n.cool <= 0) {
    const r = Math.hypot(b.x - n.x, b.z - n.z);
    const ctxType = (!b.bounces && b.y > 1.9) ? 'smash' : (!b.bounces && n.z > -6.5) ? 'volley' : 'ground';
    // A fast incoming ball (flat serve ~34 u/s) is inside the 1.4 reach for only ~0.08s — shorter
    // than a 0.10s windup. Scale the windup-start radius, the gate, and the contact reach with
    // ball speed so the racket can still meet the ball.
    const fast = clamp((Math.abs(b.vz) - 16) / 18, 0, 1); // 0 at <=16 u/s, 1 at >=34 u/s
    const startR = 2.3 + fast * 1.4;
    const reachR = 1.4 + fast * 0.5;
    if (!n.anim && r < startR && b.z < 1.5 && (b.bounces > 0 || b.y < 3.2)) {
      n.anim = { t: 0, side: n.antSide || (b.x >= n.x ? 1 : -1), type: ctxType };
    }
    let gate = ctxType === 'volley' ? 0.06 : ctxType === 'smash' ? 0.18 : 0.10;
    if (ctxType === 'ground') gate *= 1 - 0.6 * fast; // 0.10s -> 0.04s for the fastest balls
    if (n.anim && n.anim.t < gate)
      n.anim.contact = [clamp(b.x - n.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - n.z, -1.35, 1.35)];
    if (r < reachR && b.y < 3.45 && b.z < 0.35 && (b.bounces > 0 || b.y < 3.0) && n.anim && n.anim.t >= gate) {
      if (Math.random() < d.whiff) { logEvent('npcWhiff', {}); n.cool = 1.0; return; }
      npcHit(r);
    }
  }
}

function npcHit(reachDist) {
  const n = G.npc, b = G.ball, d = DIFF[G.diffKey], P = G.player;
  const bounced = b.bounces > 0;
  const tookShort = n.z > -8;
  let spin = 1, speed = d.pace, clear = 0.65, tzBase = 9.6, animType = 'ground';
  let shotType = 'topspin';
  if (!bounced && b.y > 1.9)        { speed = d.pace + 9; spin = 0; clear = 0.22; tzBase = 8.6;  animType = 'smash';  shotType = 'smash'; }
  else if (!bounced && n.z > -6.5)  { speed = d.pace * 0.7; spin = 0; clear = 0.45; tzBase = 6.4; animType = 'volley'; shotType = 'volley'; }
  else if (P.z < 7 && Math.random() < 0.30) { spin = 0; speed = 13; clear = 3.0; tzBase = 10.3; shotType = 'lob'; }
  else if (Math.random() < 0.18)    { spin = -1; speed = d.pace * 0.74; clear = 1.0; tzBase = 9.2; shotType = 'slice'; }

  let tx, tz = tzBase + rnd(-1.2, 1.2);
  let aimMode;
  {
    const mix = d.aimMix;
    let roll = Math.random() * (mix.wide + mix.wrongFoot + mix.deepMiddle + mix.chasePlayer + mix.random);
    if ((roll -= mix.wide) < 0) aimMode = 'wide';
    else if ((roll -= mix.wrongFoot) < 0) aimMode = 'wrongFoot';
    else if ((roll -= mix.deepMiddle) < 0) aimMode = 'deepMiddle';
    else if ((roll -= mix.chasePlayer) < 0) aimMode = 'chasePlayer';
    else aimMode = 'random';
    if (aimMode === 'wrongFoot' && Math.abs(P.vx) <= 0.4 && Math.abs(P.x) <= 1.0) aimMode = 'wide'; // moving OR off-center
  }
  if (aimMode === 'wide') {
    tx = P.x > 0 ? rnd(-3.3, -1.0) : rnd(1.0, 3.3);
  } else if (aimMode === 'wrongFoot') {
    // behind the player's momentum, or — if nearly still — behind the side they'll recover from
    const dir = Math.abs(P.vx) > 0.4 ? Math.sign(P.vx) : (Math.sign(P.x) || 1);
    tx = -dir * rnd(1.6, 3.0);
  } else if (aimMode === 'deepMiddle') {
    tx = rnd(-1.0, 1.0); tz = tzBase + rnd(0.6, 1.6);   // heavy depth through the middle
  } else if (aimMode === 'chasePlayer') {
    tx = clamp(P.x * (G.mode === 'rally' ? 0.7 : 0.5), -2, 2) + rnd(-1.0, 1.0);
  } else {
    tx = rnd(-2.9, 2.9);
  }
  const txRaw = tx, tzRaw = tz;
  let err = d.err * (G.mode === 'rally' ? 0.55 : 1);
  let forcedError = null;
  if (Math.random() < err) {
    if (Math.random() < 0.5)       { tx = (Math.random() < 0.5 ? -1 : 1) * rnd(4.15, 4.7); forcedError = 'wide'; }
    else if (Math.random() < 0.5)  { tz = rnd(11.95, 12.7); forcedError = 'long'; }
    else                           { tz = rnd(0.6, 2.0); clear = -0.12; forcedError = 'net'; }
  }
  const txPreNoise = tx, tzPreNoise = tz;
  const lunge = Math.min(1, reachDist / 1.4);
  const nFore = (b.x - n.x) <= 0;
  const nBodyPen = bodyContactPenalty(b.x - n.x, nFore, true);
  tx += gauss() * (0.3 + 0.9 * lunge * lunge) * nBodyPen;
  tz += gauss() * (0.2 + 0.6 * lunge * lunge) * nBodyPen;
  if (n.anim) n.anim.contact = [clamp(b.x - n.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - n.z, -1.35, 1.35)];
  tz = Math.max(tz, 2.0);
  if (clear < 0) tz = Math.min(tz, 2.0);
  speed *= rnd(0.92, 1.08);
  const deep = tz > 9.2;
  const finalTx = clamp(tx, -5.8, 5.8);
  logEvent('npcDecision', {
    shotType, aimMode, forcedError, lunge,
    reachDist, tookShort,
    aimRaw: { tx: txRaw, tz: tzRaw },
    preNoise: { tx: txPreNoise, tz: tzPreNoise },
    final: { tx: finalTx, tz },
    speed, spin, clear,
    playerPos: { x: P.x, z: P.z },
    errRate: err, diff: G.diffKey,
  });
  hitBall(1, finalTx, tz, speed, spin, clear);
  if (animType === 'volley' || animType === 'smash') n.netMode = true;
  else if (deep && clear > 0 && Math.random() < d.appr + (tookShort ? 0.25 : 0)) n.netMode = true;
  if (n.netMode) n.netX = clamp(tx * 0.45, -2.8, 2.8);
  n.recoverX = clamp(finalTx * 0.30 + G.npcMem.rallyX * 0.25, -3.0, 3.0);
  n.cool = 0.5; n.recover = 0.4;
}
