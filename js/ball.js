import { GRAV, DIFF, SW, DW, HL, SVC } from './constants.js';
import { G } from './state.js';
import { clamp, netHeight } from './utils.js';
import { sHit, sBounce, sNet, sOut } from './audio.js';
import { solveShot, predictLanding } from './physics.js';
import { refreshHUD } from './hud.js';
import { serveSide } from './scoring.js';
import { fault } from './serve.js';
import { endPoint } from './match.js';
import { logEvent } from './logger.js';

export function hitBall(hitter, tx, tz, speed, spin, clear, shotType) {
  const b = G.ball;
  const g = GRAV * (1 + 0.22 * spin);
  const v = solveShot(b.x, b.y, b.z, tx, tz, speed, g, clear);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.spin = spin; b.curve = 0;
  b.lastHitter = hitter; b.bounces = 0; b.isServe = false; b.netHit = false;
  b.hitFlash = { x: b.x, y: b.y, z: b.z, t: 0 };
  G.rally++;
  if (hitter === 0) {
    G.npc.reactT = DIFF[G.diffKey].react; G.npc.plan = null;
    if (G.npc2) { G.npc2.reactT = DIFF[G.diffKey].react; G.npc2.plan = null; }
    G.strike = null;
  }
  // Drag-aware predicted landing + in/out classification. Comparing target → predicted
  // → the eventual bounce event isolates where a shot goes wrong: aimed out (target),
  // solver/physics drift (predicted vs target), or sim mismatch (predicted vs bounce).
  const L = predictLanding();
  let predIn = null, predMargin = null;
  if (L) {
    const halfW = G.matchType === 'doubles' ? DW : SW;
    predMargin = { dz: HL - Math.abs(L.z), dx: halfW - Math.abs(L.x) };
    predIn = predMargin.dz >= 0 && predMargin.dx >= 0;
  }
  logEvent('hit', {
    hitter, target: { tx, tz }, speed, spin, clear, shotType, rally: G.rally,
    v: { vx: v.vx, vy: v.vy, vz: v.vz }, predicted: L, predIn, predMargin,
  });
  sHit(shotType, speed, { hitter });
  refreshHUD();
}

export function updateBall(dt) {
  const b = G.ball;
  if (!b.active || b.held) return;
  if (b.squashT > 0) b.squashT = Math.max(0, b.squashT - dt);
  if (b.hitFlash) { b.hitFlash.t += dt; if (b.hitFlash.t > 0.28) b.hitFlash = null; }
  const g = GRAV * (1 + 0.22 * b.spin);
  b.vy -= g * dt;
  b.vx += (b.curve || 0) * dt;
  const drag = 1 - 0.045 * dt;
  b.vx *= drag; b.vz *= drag;
  const pz = b.z, py = b.y, px = b.x;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;

  if ((pz > 0) !== (b.z > 0) && pz !== b.z) {
    const f = (0 - pz) / (b.z - pz);
    const yC = py + (b.y - py) * f, xC = px + (b.x - px) * f;
    if (yC < netHeight(xC)) {
      b.x = xC; b.y = Math.max(0.05, Math.min(yC, netHeight(xC) - 0.03));
      b.z = pz > 0 ? 0.07 : -0.07;
      b.vz = (pz > 0 ? 1 : -1) * Math.abs(b.vz) * 0.07;
      b.vx *= 0.25; b.vy = Math.min(b.vy, 0); b.spin = 0; b.netHit = true;
      logEvent('netCord', { xC, yC, netH: netHeight(xC) });
      if (G.state === 'live') sNet();
    }
  }
  if (b.y <= 0 && b.vy < 0) {
    b.y = 0;
    groundEvent(b);
  }
  b.trail.push({ x: b.x, y: b.y, z: b.z });
  if (b.trail.length > 13) b.trail.shift();
  if (b.z > 24)  { b.z = 24;  b.vz = -Math.abs(b.vz) * 0.3; b.vx *= 0.5; }
  if (b.z < -24) { b.z = -24; b.vz =  Math.abs(b.vz) * 0.3; b.vx *= 0.5; }
  if (b.x > 18)  { b.x = 18;  b.vx = -Math.abs(b.vx) * 0.3; }
  if (b.x < -18) { b.x = -18; b.vx =  Math.abs(b.vx) * 0.3; }
}

export function serveBoxOK(b) {
  const sv = b.lastHitter, rc = 1 - sv, side = serveSide(), m = 0.07;
  if (rc === 1) {
    if (!(b.z <= 0 && b.z >= -SVC - m)) return false;
    return side === 'deuce' ? (b.x >= -SW - m && b.x <= m) : (b.x <= SW + m && b.x >= -m);
  } else {
    if (!(b.z >= 0 && b.z <= SVC + m)) return false;
    return side === 'deuce' ? (b.x <= SW + m && b.x >= -m) : (b.x >= -SW - m && b.x <= m);
  }
}

export function applyBounce(b) {
  const e  = b.spin > 0 ? 0.68 : b.spin < 0 ? 0.45 : 0.56;
  const fr = b.spin > 0 ? 0.90 : b.spin < 0 ? 0.80 : 0.83;
  b.vy = -b.vy * e;
  b.vx = b.vx * fr + (b.curve || 0) * 0.85;
  b.vz *= fr; b.spin *= 0.35; b.curve = (b.curve || 0) * 0.25;
  if (b.vy < 0.55) { b.vy = 0; b.vx *= 0.95; b.vz *= 0.95; }
}

function groundEvent(b) {
  if (G.state === 'live') sBounce();
  b.squashT = 0.14;
  const spd = Math.hypot(b.vx, b.vz);
  const n = Math.min(8, 3 + Math.floor(spd * 0.35));
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const v = 1.0 + Math.random() * 2.8;
    G.particles.push({ x: b.x, z: b.z, vx: Math.cos(ang)*v, vz: Math.sin(ang)*v, age: 0, maxAge: 0.25 + Math.random()*0.14 });
  }
  G.bounceMarks.push({ x: b.x, z: b.z, age: 0 });
  if (G.bounceMarks.length > 6) G.bounceMarks.shift();
  if (G.state === 'live') {
    const side = b.z >= 0 ? 0 : 1;
    const halfW = G.matchType === 'doubles' ? DW : SW;
    const inCourt = Math.abs(b.x) <= halfW + 0.07 && Math.abs(b.z) <= HL + 0.07;
    logEvent('bounce', {
      side, inCourt, isServe: b.isServe, bounceN: b.bounces,
      serveBoxOK: (b.isServe && b.bounces === 0) ? serveBoxOK(b) : null,
    });
    if (b.isServe && b.bounces === 0) {
      if (!b.netHit && serveBoxOK(b)) {
        if (b.lastHitter === 0 && b.vz < -0.1) {
          const projX = clamp(b.x + (b.vx / b.vz) * (-12.6 - b.z), -6, 6);
          const rec = { projX, w: 1 };
          const arr = G.npcMem.serve[serveSide()];
          arr.push(rec); if (arr.length > 8) arr.shift();
          G.npcMem.lastServeRec = rec;
        }
        b.isServe = false; b.bounces = 1;
      } else { applyBounce(b); fault(); return; }
    } else if (b.bounces === 0) {
      if (b.lastHitter === 0 && side === 1 && inCourt)
        G.npcMem.rallyX = G.npcMem.rallyX * 0.65 + b.x * 0.35;
      if (b.netHit) { applyBounce(b); endPoint(1 - b.lastHitter, b.lastHitter === 0 ? 'Net!' : 'CPU nets it'); return; }
      if (side === b.lastHitter) { applyBounce(b); endPoint(1 - b.lastHitter, 'Net!'); return; }
      if (!inCourt) { applyBounce(b); sOut(); endPoint(1 - b.lastHitter, b.lastHitter === 0 ? 'Out!' : 'CPU hits it out'); return; }
      b.bounces = 1;
    } else {
      applyBounce(b);
      endPoint(b.lastHitter, b.lastHitter === 0 ? 'Winner!' : 'CPU wins the point');
      return;
    }
  }
  applyBounce(b);
}
