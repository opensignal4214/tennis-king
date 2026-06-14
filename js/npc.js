import { DIFF, TOSS_APEX, DW } from './constants.js';
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

  const npcIdx = G.matchType === 'doubles' ? 2 : 1;
  if (G.state === 'serve' && servingPlayer() === npcIdx) {
    G.serveT -= dt;
    if (G.serveT <= 0) { startToss(npcIdx); }
    return;
  }
  if (G.state === 'toss' && G.toss && G.toss.by === npcIdx) {
    if (!G.toss.strikeAt) G.toss.strikeAt = TOSS_APEX + gauss() * d.tossErr;
    if (G.toss.t >= G.toss.strikeAt) {
      const err = Math.abs(G.toss.t - TOSS_APEX);
      const q = err <= 0.045 ? 'perfect' : err <= 0.10 ? 'good' : err <= 0.18 ? 'ok' : 'weak';
      G.toss.hit = true;
      fireServe(npcIdx, q, tossY(G.toss.t));
    }
    return;
  }
  if (G.state !== 'live') return;

  // Doubles: delegate to shared cpu step
  if (G.matchType === 'doubles') { cpuStep(G.npc, G.npc2, dt, true); return; }

  // ---- Singles (original logic unchanged) ----
  if (b.lastHitter === 0) {
    const dxa = b.x - n.x;
    if (!n.antSide) n.antSide = dxa >= 0 ? 1 : -1;
    else if (n.antSide === 1 && dxa < -0.35) n.antSide = -1;
    else if (n.antSide === -1 && dxa > 0.35) n.antSide = 1;
    if (n.reactT > 0) { n.reactT -= dt; }
    else if (!n.plan) {
      const L = predictLanding();
      if (L && L.z < -8.0) n.netMode = false;
      const lobbed = b.vy > 6 || b.y > 3.2;
      if (lobbed) n.netMode = false;
      const path = predictPath(lobbed ? 5.0 : 2.4);
      let comfort = null, feasibleAny = null, stretch = null, smash = null, minDef = Infinity;
      for (const s of path) {
        if (s.z > -0.9 || s.z < -15) continue;
        const reach = Math.hypot(s.x - n.x, s.z - n.z);
        const deficit = reach - d.speed * Math.max(0.01, s.t - 0.08);
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
    const fast = clamp((Math.abs(b.vz) - 16) / 18, 0, 1);
    const startR = 2.3 + fast * 1.4;
    const reachR = 1.4 + fast * 0.5;
    if (!n.anim && r < startR && b.z < 1.5 && (b.bounces > 0 || b.y < 3.2)) {
      n.anim = { t: 0, side: n.antSide || (b.x >= n.x ? 1 : -1), type: ctxType };
    }
    let gate = ctxType === 'volley' ? 0.06 : ctxType === 'smash' ? 0.18 : 0.10;
    if (ctxType === 'ground') gate *= 1 - 0.6 * fast;
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
  const lunge = Math.min(1, reachDist / 1.4);
  let spin = 1, speed = d.pace, clear = 0.65, tzBase = 9.6, animType = 'ground';
  let shotType = 'topspin';
  if (!bounced && b.y > 1.9 && lunge <= 0.75) { speed = d.pace + 9; spin = 0; clear = 0.22; tzBase = 8.6;  animType = 'smash';  shotType = 'smash'; }
  else if (!bounced && b.y > 1.9)              { speed = d.pace + 4; spin = 1; clear = 0.60; tzBase = 8.6;  animType = 'ground'; shotType = 'topspin'; }
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
    if (aimMode === 'wrongFoot' && Math.abs(P.vx) <= 0.4 && Math.abs(P.x) <= 1.0) aimMode = 'wide';
  }
  if (aimMode === 'wide') {
    tx = P.x > 0 ? rnd(-3.3, -1.0) : rnd(1.0, 3.3);
  } else if (aimMode === 'wrongFoot') {
    const dir = Math.abs(P.vx) > 0.4 ? Math.sign(P.vx) : (Math.sign(P.x) || 1);
    tx = -dir * rnd(1.6, 3.0);
  } else if (aimMode === 'deepMiddle') {
    tx = rnd(-1.0, 1.0); tz = tzBase + rnd(0.6, 1.6);
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
  const nFore = (b.x - n.x) <= 0;
  const nBodyPen = bodyContactPenalty(b.x - n.x, nFore, true);
  tx += gauss() * (0.3 + 0.9 * lunge * lunge) * nBodyPen;
  tz += gauss() * (0.2 + 0.6 * lunge * lunge) * nBodyPen;
  if (lunge > 0.7 && !forcedError) {
    const overstretch = (lunge - 0.7) / 0.3;
    tx += gauss() * 0.8 * overstretch;
    tz += gauss() * 0.6 * overstretch;
  }
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
  const sndType = shotType === 'volley' ? 'flat' : shotType;
  G.lastHitterEntity = 2;
  hitBall(1, finalTx, tz, speed, spin, clear, sndType);
  if (animType === 'volley' || animType === 'smash') n.netMode = true;
  else if (deep && clear > 0 && Math.random() < d.appr + (tookShort ? 0.25 : 0)) n.netMode = true;
  if (n.netMode) n.netX = clamp(tx * 0.45, -2.8, 2.8);
  n.recoverX = clamp(finalTx * 0.30 + G.npcMem.rallyX * 0.40, -3.0, 3.0);
  n.cool = 0.5; n.recover = 0.4;
}

// ============================================================
// DOUBLES AI — shared helpers for both CPU players
// ============================================================

function ensureHomeSide(e) {
  if (e.homeSide !== 1 && e.homeSide !== -1) e.homeSide = e.x >= 0 ? 1 : -1;
  return e.homeSide;
}

// Designates exactly one CPU player as hitter (side-ownership + closeness + hysteresis).
// Called once per frame by the primary entity (npc). Sets G.cpuHitter or null.
function pickCpuHitter() {
  const n = G.npc, n2 = G.npc2, b = G.ball;
  if (b.lastHitter !== 0) { G.cpuHitter = null; return; }
  // Serve return: the side-designated CPU receiver commits, no poaching.
  if (G.rally === 1 && (G.receiverEntity === 2 || G.receiverEntity === 3)) {
    G.cpuHitter = G.receiverEntity === 2 ? G.npc : G.npc2;
    return;
  }
  const L = predictLanding();
  const ix = L ? L.x : b.x, iz = L ? L.z : b.z;
  ensureHomeSide(n); ensureHomeSide(n2);
  const dN  = Math.hypot(ix - n.x,  iz - n.z);
  const dN2 = Math.hypot(ix - n2.x, iz - n2.z);
  // Owner is the player whose home side matches the ball's lateral half
  const owner = (ix >= 0 ? 1 : -1) === n.homeSide ? n : n2;
  const other = owner === n ? n2 : n;
  const dOwn = owner === n ? dN : dN2;
  const dOth = owner === n ? dN2 : dN;
  let chosen = (dOth < dOwn - 1.4) ? other : owner; // poach only when clearly closer
  // Hysteresis: keep current hitter unless the challenger has a big lead
  if (G.cpuHitter && G.cpuHitter !== chosen) {
    const dPrev = G.cpuHitter === n ? dN : dN2;
    const dChosen = chosen === n ? dN : dN2;
    if (dPrev <= dChosen + 0.7) chosen = G.cpuHitter;
  }
  G.cpuHitter = chosen;
}

// Builds a chase plan using the same predictPath logic as singles NPC.
function cpuChasePlan(self) {
  const b = G.ball, d = DIFF[G.diffKey];
  const L = predictLanding();
  if (L && L.z < -8.0) self.netMode = false;
  const lobbed = b.vy > 6 || b.y > 3.2;
  if (lobbed) self.netMode = false;
  const path = predictPath(lobbed ? 5.0 : 2.4);
  let comfort = null, feasibleAny = null, stretch = null, smash = null, minDef = Infinity;
  for (const s of path) {
    if (s.z > -0.9 || s.z < -15) continue;
    const reach = Math.hypot(s.x - self.x, s.z - self.z);
    const deficit = reach - d.speed * Math.max(0.01, s.t - 0.08);
    if (!s.bounced && s.y >= 1.9 && s.y <= 3.0 && deficit <= 0 && !smash) smash = s;
    if (s.y > 2.6) continue;
    if (deficit <= 0) {
      if (!feasibleAny) feasibleAny = s;
      if (s.bounced && s.y >= 0.4 && s.y <= 1.7) { comfort = s; break; }
    }
    if (deficit < minDef) { minDef = deficit; stretch = s; }
  }
  const pick = smash || comfort || feasibleAny || stretch;
  let plan;
  if (pick) plan = { x: clamp(pick.x, -7.5, 7.5), z: clamp(pick.z, -15, -0.9) };
  else if (L && L.z < 0.5) plan = { x: clamp(L.x, -7.5, 7.5), z: clamp(L.z - 1.25, -15, -0.9) };
  else plan = { x: self.x, z: self.z };
  logEvent('npcPlan', {
    predicted: L ?? null, plan: { ...plan },
    feasible: !!(comfort || feasibleAny), lob: lobbed, overhead: !!smash,
    deficit: (comfort || feasibleAny) ? 0 : (isFinite(minDef) ? minDef : null),
  });
  return plan;
}

// Cover target: hold own half, shift as a unit toward the ball (triangle positioning).
function cpuCoverTarget(self) {
  const b = G.ball;
  ensureHomeSide(self);
  const spread = self.netMode ? 2.4 : 2.6;
  const lobbed = b.vy > 6 || b.y > 3.2;
  if (lobbed && self.netMode) {
    const L = predictLanding();
    if (L && (L.x >= 0 ? 1 : -1) === self.homeSide && Math.abs(L.z) > 6) self.netMode = false;
  }
  // Both players slide toward the ball's x position to cover the outgoing path
  const shift = clamp(b.x * 0.28, -1.6, 1.6);
  const tx = clamp(self.homeSide * spread + shift, -DW + 0.35, DW - 0.35);
  const tz = self.netMode ? -2.7 : -10.8;
  return { x: tx, z: tz };
}

// Handles net-intercept targeting when at net and not the designated hitter
function cpuNetCover(self) {
  if (!self.netMode) return null;
  const ic = simBallToNpcZ(-2.8);
  if (!ic) return null;
  ensureHomeSide(self);
  // Intercept only if it's on own half or close to it
  const onSide = Math.sign(ic.x || self.homeSide) === self.homeSide || Math.abs(ic.x) < 0.8;
  if (!onSide) return null;
  return { x: clamp(ic.x, -4.6, 4.6), z: -2.8 };
}

// Shared movement integration — mirrors the singles NPC movement math
function moveEntity(self, dt) {
  const b = G.ball, d = DIFF[G.diffKey];
  const dx = self.tgt.x - self.x, dz = self.tgt.z - self.z, dist = Math.hypot(dx, dz);
  let maxSp = d.speed, accel = 13 * (d.speed / 5.2);
  if ((self.recover || 0) > 0) { accel *= 0.25; maxSp *= 0.55; }
  else if (self.anim) { accel *= 0.35; }
  let desx = 0, desz = 0;
  if (dist > 0.08) { const sp2 = Math.min(maxSp, dist * 3.5); desx = dx / dist * sp2; desz = dz / dist * sp2; }
  if (desz < -0.1 && !(b.isServe && b.lastHitter === 0)) {
    self.backT = (self.backT || 0) + dt; const turned = self.backT > 0.6;
    accel *= turned ? 0.7 : 0.5;
    const cap = maxSp * (turned ? 0.8 : 0.55), dl = Math.hypot(desx, desz);
    if (dl > cap) { desx *= cap / dl; desz *= cap / dl; }
  } else self.backT = 0;
  self.vx = (self.vx || 0) + clamp(desx - (self.vx || 0), -accel * dt, accel * dt);
  self.vz = (self.vz || 0) + clamp(desz - (self.vz || 0), -accel * dt, accel * dt);
  self.x += self.vx * dt; self.z += self.vz * dt;
  self.spd = Math.hypot(self.vx, self.vz); self.lvx = self.vx;
  self.stride = (self.stride || 0) + self.spd * dt * 3.1;
}

// Shared CPU hit (generalised npcHit for doubles with side-aware recovery and open-court aiming)
function cpuHit(self, entityIdx) {
  const b = G.ball, d = DIFF[G.diffKey];
  ensureHomeSide(self);
  const reachDist = Math.hypot(b.x - self.x, b.z - self.z);
  const bounced = b.bounces > 0;
  const tookShort = self.z > -8;
  const lunge = Math.min(1, reachDist / 1.4);
  let spin = 1, speed = d.pace, clear = 0.65, tzBase = 9.6, animType = 'ground', shotType = 'topspin';
  if (!bounced && b.y > 1.9 && lunge <= 0.75) { speed = d.pace + 9; spin = 0; clear = 0.22; tzBase = 8.6; animType = 'smash'; shotType = 'smash'; }
  else if (!bounced && b.y > 1.9)              { speed = d.pace + 4; spin = 1; clear = 0.60; tzBase = 8.6; animType = 'ground'; shotType = 'topspin'; }
  else if (!bounced && self.z > -6.5)          { speed = d.pace * 0.7; spin = 0; clear = 0.45; tzBase = 6.4; animType = 'volley'; shotType = 'volley'; }
  else if (Math.random() < 0.18)               { spin = -1; speed = d.pace * 0.74; clear = 1.0; tzBase = 9.2; shotType = 'slice'; }

  let tz = tzBase + rnd(-1.2, 1.2);

  // Open-court aiming in doubles — find the lateral position least covered by opponents
  const opponents = [G.player, G.partner].filter(Boolean);
  const candidates = [-3.6, -1.8, 0, 1.8, 3.6];
  let bestTx = 0, bestGap = -Infinity;
  for (const cx of candidates) {
    const minDist = opponents.reduce((mn, op) => Math.min(mn, Math.abs(op.x - cx)), Infinity);
    if (minDist > bestGap) { bestGap = minDist; bestTx = cx; }
  }
  // 25% chance: body shot or wrong-foot a moving opponent
  let tx = bestTx + rnd(-0.8, 0.8);
  if (opponents.length > 0 && Math.random() < 0.25) {
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    const dir = Math.abs(target.vx) > 0.4 ? Math.sign(target.vx) : (Math.sign(target.x) || 1);
    tx = clamp(dir > 0 ? target.x - rnd(1.0, 2.0) : target.x + rnd(1.0, 2.0), -DW + 0.3, DW - 0.3);
  }

  // Lob when player at net (partner situation — same as singles NPC lob logic)
  const atNet = opponents.some(op => op.z < 6);
  if (atNet && Math.random() < 0.20 && shotType === 'topspin') {
    spin = 0; speed = 13; clear = 3.0; tzBase = 10.3; tz = tzBase + rnd(-0.8, 0.8); shotType = 'lob';
  }

  let forcedError = null;
  const err = d.err;
  if (Math.random() < err) {
    if (Math.random() < 0.5)      { tx = (Math.random() < 0.5 ? -1 : 1) * rnd(4.15, 4.7); forcedError = 'wide'; }
    else if (Math.random() < 0.5) { tz = rnd(11.95, 12.7); forcedError = 'long'; }
    else                          { tz = rnd(0.6, 2.0); clear = -0.12; forcedError = 'net'; }
  }

  const fore = (b.x - self.x) <= 0;
  const bodyPen = bodyContactPenalty(b.x - self.x, fore, true);
  tx += gauss() * (0.3 + 0.9 * lunge * lunge) * bodyPen;
  tz += gauss() * (0.2 + 0.6 * lunge * lunge) * bodyPen;
  if (lunge > 0.7 && !forcedError) {
    const os = (lunge - 0.7) / 0.3;
    tx += gauss() * 0.8 * os; tz += gauss() * 0.6 * os;
  }
  if (self.anim) self.anim.contact = [clamp(b.x - self.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - self.z, -1.35, 1.35)];
  tz = Math.max(tz, 2.0);
  if (clear < 0) tz = Math.min(tz, 2.0);
  speed *= rnd(0.92, 1.08);
  const deep = tz > 9.2;
  const finalTx = clamp(tx, -5.8, 5.8);

  G.lastHitterEntity = entityIdx;
  hitBall(1, finalTx, tz, speed, spin, clear, shotType === 'volley' ? 'flat' : shotType);

  // Recover toward own half
  if (animType === 'volley' || animType === 'smash') {
    self.netMode = true;
    self.netX = clamp(self.homeSide * 2.0 + finalTx * 0.15, -2.8, 2.8);
  } else if (deep && clear > 0 && Math.random() < d.appr + (tookShort ? 0.25 : 0)) {
    self.netMode = true;
    self.netX = clamp(self.homeSide * 2.0 + finalTx * 0.15, -2.8, 2.8);
  }
  self.recoverX = clamp(self.homeSide * 2.2, -3.0, 3.0);
  // After hitting, reset hitter so partner covers
  G.cpuHitter = null;
  self.cool = 0.5; self.recover = 0.4;
}

// One step for a CPU entity in doubles. isPrimary=true → entity runs pickCpuHitter() this frame.
function cpuStep(self, mate, dt, isPrimary) {
  const b = G.ball, d = DIFF[G.diffKey];
  const entityIdx = self === G.npc ? 2 : 3;
  const incoming = b.lastHitter === 0 && !b.isServe;

  if (isPrimary) {
    if (incoming) pickCpuHitter();
    else G.cpuHitter = null;
  }

  const amHitter = incoming && G.cpuHitter === self;

  // Anticipation lean (only when this entity is the designated hitter)
  if (amHitter) {
    const dxa = b.x - self.x;
    if (!self.antSide) self.antSide = dxa >= 0 ? 1 : -1;
    else if (self.antSide === 1 && dxa < -0.35) self.antSide = -1;
    else if (self.antSide === -1 && dxa > 0.35) self.antSide = 1;
    if ((self.reactT || 0) > 0) self.reactT -= dt;
    else if (!self.plan) self.plan = cpuChasePlan(self);
  } else {
    self.antSide = 0;
    self.plan = null;
  }

  // Target selection
  if (amHitter && (self.reactT || 0) <= 0 && self.plan) {
    if (b.bounces > 0) {
      self.tgt = { x: clamp(b.x + b.vx * 0.13, -7.5, 7.5), z: clamp(Math.min(b.z - 0.9, -0.8), -15, -0.8) };
    } else if (self.netMode && b.bounces === 0) {
      const ic = simBallToNpcZ(-2.8);
      if (ic) self.tgt = { x: clamp(ic.x, -4.6, 4.6), z: -2.8 };
      else self.tgt = self.plan;
    } else {
      self.tgt = self.plan;
    }
  } else if (!amHitter && self.netMode && incoming) {
    // Non-hitter at net: try to intercept only if ball comes to own side
    const cover = cpuNetCover(self);
    self.tgt = cover || cpuCoverTarget(self);
  } else {
    self.tgt = cpuCoverTarget(self);
  }

  moveEntity(self, dt);

  // Hit check — only the designated hitter swings
  if (!amHitter || self.cool > 0) return;
  const r = Math.hypot(b.x - self.x, b.z - self.z);
  const ctxType = (!b.bounces && b.y > 1.9) ? 'smash' : (!b.bounces && self.z > -6.5) ? 'volley' : 'ground';
  const fast = clamp((Math.abs(b.vz) - 16) / 18, 0, 1);
  const startR = 2.3 + fast * 1.4, reachR = 1.4 + fast * 0.5;
  if (!self.anim && r < startR && b.z < 1.5 && (b.bounces > 0 || b.y < 3.2))
    self.anim = { t: 0, side: self.antSide || (b.x >= self.x ? 1 : -1), type: ctxType };
  let gate = ctxType === 'volley' ? 0.06 : ctxType === 'smash' ? 0.18 : 0.10;
  if (ctxType === 'ground') gate *= 1 - 0.6 * fast;
  if (self.anim && self.anim.t < gate)
    self.anim.contact = [clamp(b.x - self.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - self.z, -1.35, 1.35)];
  if (r < reachR && b.y < 3.45 && b.z < 0.35 && (b.bounces > 0 || b.y < 3.0) && self.anim && self.anim.t >= gate) {
    if (Math.random() < d.whiff) { self.cool = 1.0; return; }
    cpuHit(self, entityIdx);
  }
}

// ============================================================
// Doubles: Partner AI (human-team entity 1)
// ============================================================

export function updatePartner(dt) {
  if (G.matchType !== 'doubles' || !G.partner) return;
  const p = G.partner, b = G.ball, d = DIFF[G.diffKey];
  p.cool = (p.cool || 0) - dt;
  p.recover = (p.recover || 0) - dt;
  if (p.anim) { p.anim.t += dt; if (p.anim.t > 0.7) p.anim = null; }

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

  ensureHomeSide(p);
  const incoming = b.lastHitter === 1 && !b.isServe;
  const isReturn = G.rally === 1 && incoming;
  let amHitter = false;
  if (incoming) {
    const L = predictLanding();
    const ballSide = (L ? L.x : b.x) >= 0 ? 1 : -1;
    if (isReturn) amHitter = (G.receiverEntity === 1);   // only the designated receiver returns
    else amHitter = (ballSide === p.homeSide);           // in rallies, cover own lateral half
  }

  // Lob over a net player on their side → drop back to chase
  const lobbed = b.vy > 6 || b.y > 3.2;
  if (lobbed && p.netMode && incoming) {
    const Ll = predictLanding();
    if (Ll && (Ll.x >= 0 ? 1 : -1) === p.homeSide && Ll.z > 6) p.netMode = false;
  }

  if (amHitter) {
    const dxa = b.x - p.x;
    if (!p.antSide) p.antSide = dxa >= 0 ? 1 : -1;
    else if (p.antSide === 1 && dxa < -0.35) p.antSide = -1;
    else if (p.antSide === -1 && dxa > 0.35) p.antSide = 1;
    const L = predictLanding();
    p.tgt = L && L.z > 0
      ? { x: clamp(L.x, -DW + 0.3, DW - 0.3), z: clamp(L.z - 0.5, 0.4, 14) }
      : { x: clamp(b.x + b.vx * 0.08, -DW + 0.3, DW - 0.3), z: clamp(b.z + 0.2, 0.4, 14) };
  } else {
    p.antSide = 0;
    const shift = clamp(b.x * 0.22, -1.3, 1.3);
    const tx = clamp(p.homeSide * 2.4 + shift, -DW + 0.35, DW - 0.35);
    const tz = p.netMode ? 2.5 : 11.5;
    p.tgt = { x: tx, z: tz };
  }

  const dx = p.tgt.x - p.x, dz = p.tgt.z - p.z, dist = Math.hypot(dx, dz);
  let maxSp = d.speed * 0.9, accel = 11 * (d.speed / 5.2);
  if ((p.recover || 0) > 0) { accel *= 0.25; maxSp *= 0.55; }
  else if (p.anim) { accel *= 0.35; }
  let desx = 0, desz = 0;
  if (dist > 0.08) { const sp2 = Math.min(maxSp, dist * 3.5); desx = dx / dist * sp2; desz = dz / dist * sp2; }
  p.vx = (p.vx || 0) + clamp(desx - (p.vx || 0), -accel * dt, accel * dt);
  p.vz = (p.vz || 0) + clamp(desz - (p.vz || 0), -accel * dt, accel * dt);
  p.x = clamp(p.x + p.vx * dt, -DW + 0.1, DW - 0.1);
  p.z = clamp(p.z + p.vz * dt, 0.4, 15);
  p.spd = Math.hypot(p.vx, p.vz);
  p.lvx = p.vx;
  p.stride = (p.stride || 0) + p.spd * dt * 3.1;

  if (!amHitter || (p.cool || 0) > 0 || !incoming) return;
  const r = Math.hypot(b.x - p.x, b.z - p.z);
  const ctxType = (!b.bounces && b.y > 1.9) ? 'smash' : (!b.bounces && p.z < 5) ? 'volley' : 'ground';
  const fast = clamp((Math.abs(b.vz) - 16) / 18, 0, 1);
  const startR = 2.3 + fast * 1.4, reachR = 1.4 + fast * 0.5;
  if (!p.anim && r < startR && b.z > 0 && (b.bounces > 0 || b.y < 3.2))
    p.anim = { t: 0, side: p.antSide || (b.x >= p.x ? 1 : -1), type: ctxType };
  let gate = ctxType === 'volley' ? 0.06 : ctxType === 'smash' ? 0.18 : 0.10;
  if (ctxType === 'ground') gate *= 1 - 0.6 * fast;
  if (p.anim && p.anim.t < gate)
    p.anim.contact = [clamp(b.x - p.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - p.z, -1.35, 1.35)];
  if (r < reachR && b.y < 3.45 && b.z > 0 && (b.bounces > 0 || b.y < 3.0) && p.anim && p.anim.t >= gate) {
    partnerHit(p);
  }
}

function partnerHit(p) {
  const b = G.ball, d = DIFF[G.diffKey];
  const speed = d.pace * rnd(0.85, 1.0);
  const spin = Math.random() < 0.6 ? 1 : 0;
  const clear = 0.7;
  const tz = -(8.0 + rnd(-1.2, 1.2));
  // Aim into the open CPU court — find largest gap between npc and npc2
  const cpus = [G.npc, G.npc2].filter(Boolean);
  const candidates = [-3.2, -1.2, 0, 1.2, 3.2];
  let bestTx = 0, bestGap = -Infinity;
  for (const cx of candidates) {
    const minDist = cpus.reduce((mn, op) => Math.min(mn, Math.abs(op.x - cx)), Infinity);
    if (minDist > bestGap) { bestGap = minDist; bestTx = cx; }
  }
  const tx = clamp(bestTx + gauss() * 0.5, -DW + 0.3, DW - 0.3);
  if (p.anim) p.anim.contact = [clamp(b.x - p.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - p.z, -1.35, 1.35)];
  G.lastHitterEntity = 1;
  hitBall(0, tx, tz, speed * rnd(0.92, 1.08), spin, clear, 'topspin');
  // Recover to own home side
  const side = p.homeSide || 1;
  p.netMode = true;
  p.netX = clamp(side * 2.2, -2.8, 2.8);
  p.recoverX = clamp(side * 2.2, -3.0, 3.0);
  p.cool = 0.5; p.recover = 0.35;
}

// ============================================================
// Doubles: NPC2 AI (cpu-team entity 3) — delegates to cpuStep
// ============================================================

export function updateNPC2(dt) {
  if (G.matchType !== 'doubles' || !G.npc2) return;
  const n2 = G.npc2, d = DIFF[G.diffKey];
  n2.cool = (n2.cool || 0) - dt;
  n2.recover = (n2.recover || 0) - dt;
  if (n2.anim) { n2.anim.t += dt; if (n2.anim.t > 0.7) n2.anim = null; }

  if (G.state === 'serve' && servingPlayer() === 3) {
    G.serveT -= dt;
    if (G.serveT <= 0) { startToss(3); }
    return;
  }
  if (G.state === 'toss' && G.toss && G.toss.by === 3) {
    if (!G.toss.strikeAt) G.toss.strikeAt = TOSS_APEX + gauss() * d.tossErr;
    if (G.toss.t >= G.toss.strikeAt) {
      const err = Math.abs(G.toss.t - TOSS_APEX);
      const q = err <= 0.045 ? 'perfect' : err <= 0.10 ? 'good' : err <= 0.18 ? 'ok' : 'weak';
      G.toss.hit = true;
      fireServe(3, q, tossY(G.toss.t));
    }
    return;
  }
  if (G.state !== 'live') return;

  cpuStep(G.npc2, G.npc, dt, false);
}
