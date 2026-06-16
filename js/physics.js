import { GRAV } from './constants.js';
import { G } from './state.js';
import { netHeight } from './utils.js';

export function solveShot(fx, fy, fz, tx, tz, speed, gEff, clear) {
  const dx = tx - fx, dz = tz - fz, D = Math.hypot(dx, dz);
  let T = Math.max(0.16, D / speed), vx, vy, vz;
  for (let i = 0; i < 11; i++) {
    vx = dx / T; vz = dz / T;
    vy = (0.04 - fy) / T + 0.5 * gEff * T;
    if ((fz > 0) !== (tz > 0) && vz !== 0) {
      const tn = (0 - fz) / vz;
      if (tn > 0 && tn < T) {
        const yn = fy + vy * tn - 0.5 * gEff * tn * tn;
        if (yn < netHeight(fx + vx * tn) + clear) { T *= 1.1; continue; }
      }
    }
    break;
  }
  return { vx, vy, vz };
}

export function simToPlane(zPlane) {
  const b = G.ball;
  if (!b.active || b.held) return null;
  if (b.vz <= 0.1) return b.z >= zPlane ? { t: 0, x: b.x, y: b.y } : null;
  if (b.z >= zPlane) return { t: 0, x: b.x, y: b.y };
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, spin = b.spin, curve = b.curve || 0;
  const dt = 1 / 120;
  for (let t = 0; t < 2.4; t += dt) {
    const g = GRAV * (1 + 0.22 * spin);
    const px = x, py = y, pz = z;
    vy -= g * dt; vx += curve * dt; vx *= 1 - 0.045 * dt; vz *= 1 - 0.045 * dt; // match updateBall drag
    x += vx * dt; y += vy * dt; z += vz * dt;
    if ((pz > 0) !== (z > 0) && pz !== z) {
      const f = (0 - pz) / (z - pz);
      if (py + (y - py) * f < netHeight(px + (x - px) * f)) return null; // dies at the net
    }
    if (y <= 0 && vy < 0) {
      const e = spin > 0 ? 0.68 : spin < 0 ? 0.45 : 0.56;
      const fr = spin > 0 ? 0.90 : spin < 0 ? 0.80 : 0.83;
      y = 0; vy = -vy * e; vx = vx * fr + curve * 0.85; vz *= fr; spin *= 0.35; curve *= 0.25;
      if (vy < 0.55) return null;
    }
    if (z >= zPlane) return { t, x, y };
  }
  return null;
}

export function simBallToNpcZ(zPlane) {
  const b = G.ball;
  if (!b.active || b.held || b.vz >= -0.4) return null;
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, spin = b.spin, curve = b.curve || 0;
  const dt = 1 / 120;
  for (let t = 0; t < 2.4; t += dt) {
    const g = GRAV * (1 + 0.22 * spin);
    const px = x, py = y, pz = z;
    vy -= g * dt; vx += curve * dt; vx *= 1 - 0.045 * dt; vz *= 1 - 0.045 * dt; // match updateBall drag
    x += vx * dt; y += vy * dt; z += vz * dt;
    if ((pz > 0) !== (z > 0) && pz !== z) {
      const f = (0 - pz) / (z - pz);
      if (py + (y - py) * f < netHeight(px + (x - px) * f)) return null; // dies at the net
    }
    if (y <= 0 && vy < 0) {
      const e = spin > 0 ? 0.68 : spin < 0 ? 0.45 : 0.56;
      const fr = spin > 0 ? 0.90 : spin < 0 ? 0.80 : 0.83;
      y = 0; vy = -vy * e; vx = vx * fr + curve * 0.85; vz *= fr; spin *= 0.35; curve *= 0.25;
      if (vy < 0.55) return null;
    }
    if (z <= zPlane) return { t, x, y };
  }
  return null;
}

export function predictLanding() {
  const b = G.ball;
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz;
  const g = GRAV * (1 + 0.22 * b.spin), dt = 1 / 90, curve = b.curve || 0;
  for (let t = 0; t < 6.0; t += dt) { // long horizon so a high lob is still tracked to its landing
    const px = x, py = y, pz = z;
    vy -= g * dt; vx += curve * dt; vx *= 1 - 0.045 * dt; vz *= 1 - 0.045 * dt; // match updateBall drag
    x += vx * dt; y += vy * dt; z += vz * dt;
    if ((pz > 0) !== (z > 0) && pz !== z) {              // crossing the net plane
      const f = (0 - pz) / (z - pz);
      const xc = px + (x - px) * f, yc = py + (y - py) * f;
      if (yc < netHeight(xc)) return { x: xc, z: 0, vx, vz }; // ball dies at the net
    }
    if (y <= 0 && vy < 0) return { x, z, vx, vz };
  }
  return null;
}

export function predictPath(maxT = 2.4) {
  const b = G.ball;
  if (!b.active || b.held) return [];
  let x = b.x, y = b.y, z = b.z, vx = b.vx, vy = b.vy, vz = b.vz, spin = b.spin, curve = b.curve || 0;
  let bounced = b.bounces > 0;
  const dt = 1 / 120, out = [];
  let i = 0;
  for (let t = 0; t < maxT; t += dt, i++) {
    const g = GRAV * (1 + 0.22 * spin);
    const px = x, py = y, pz = z;
    vy -= g * dt; vx += curve * dt; vx *= 1 - 0.045 * dt; vz *= 1 - 0.045 * dt; // match updateBall drag
    x += vx * dt; y += vy * dt; z += vz * dt;
    if ((pz > 0) !== (z > 0) && pz !== z) {              // ball dies at the net — no reachable points beyond
      const f = (0 - pz) / (z - pz);
      if (py + (y - py) * f < netHeight(px + (x - px) * f)) break;
    }
    if (y <= 0 && vy < 0) {
      const e = spin > 0 ? 0.68 : spin < 0 ? 0.45 : 0.56;
      const fr = spin > 0 ? 0.90 : spin < 0 ? 0.80 : 0.83;
      y = 0; vy = -vy * e; vx = vx * fr + curve * 0.85; vz *= fr; spin *= 0.35; curve *= 0.25;
      bounced = true;
      if (vy < 0.55) break;
    }
    if (i % 4 === 0) out.push({ t, x, y, z, bounced });
  }
  return out;
}
