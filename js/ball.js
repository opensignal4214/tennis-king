import { GRAV, DIFF, SW, HL, SVC } from './constants.js';
import { G } from './state.js';
import { clamp, netHeight } from './utils.js';
import { sHit, sBounce, sNet } from './audio.js';
import { solveShot, predictLanding } from './physics.js';
import { refreshHUD } from './hud.js';
import { serveSide } from './scoring.js';
import { fault } from './serve.js';
import { endPoint } from './match.js';
import { logEvent } from './logger.js';

export function hitBall(hitter, tx, tz, speed, spin, clear) {
  const b = G.ball;
  const g = GRAV * (1 + 0.22 * spin);
  const v = solveShot(b.x, b.y, b.z, tx, tz, speed, g, clear);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.spin = spin; b.curve = 0;
  b.lastHitter = hitter; b.bounces = 0; b.isServe = false; b.netHit = false;
  G.rally++;
  if (hitter === 0) { G.npc.reactT = DIFF[G.diffKey].react; G.npc.plan = null; G.strike = null; }
  logEvent('hit', {
    hitter, target: { tx, tz }, speed, spin, clear, rally: G.rally,
    v: { vx: v.vx, vy: v.vy, vz: v.vz }, predicted: predictLanding(),
  });
  sHit(speed);
  refreshHUD();
}

export function updateBall(dt) {
  const b = G.ball;
  if (!b.active || b.held) return;
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
      sNet();
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
  sBounce();
  if (G.state === 'live') {
    const side = b.z >= 0 ? 0 : 1;
    const inCourt = Math.abs(b.x) <= SW + 0.07 && Math.abs(b.z) <= HL + 0.07;
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
        G.npcMem.rallyX = G.npcMem.rallyX * 0.75 + b.x * 0.25;
      if (b.netHit) { applyBounce(b); endPoint(1 - b.lastHitter, b.lastHitter === 0 ? 'Net!' : 'CPU nets it'); return; }
      if (side === b.lastHitter) { applyBounce(b); endPoint(1 - b.lastHitter, 'Net!'); return; }
      if (!inCourt) { applyBounce(b); endPoint(1 - b.lastHitter, b.lastHitter === 0 ? 'Out!' : 'CPU hits it out'); return; }
      b.bounces = 1;
    } else {
      applyBounce(b);
      endPoint(b.lastHitter, b.lastHitter === 0 ? 'Winner!' : 'CPU wins the point');
      return;
    }
  }
  applyBounce(b);
}
