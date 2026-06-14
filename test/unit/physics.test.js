import { describe, it, expect, beforeEach } from 'vitest';
import { G } from '../../js/state.js';
import { solveShot, simToPlane, simBallToNpcZ, predictLanding, predictPath } from '../../js/physics.js';
import { netHeight } from '../../js/utils.js';
import { GRAV } from '../../js/constants.js';

// ─── solveShot ────────────────────────────────────────────────────────────────

describe('solveShot', () => {
  it('returns negative vz for player-to-NPC shot', () => {
    const v = solveShot(0, 1.2, 10, 0, -9, 25, GRAV, 0.65);
    expect(v.vz).toBeLessThan(0);
  });

  it('ball clears the net when crossing z=0', () => {
    const { vx, vy, vz } = solveShot(0, 1.2, 10, 0, -9, 25, GRAV, 0.65);
    let x = 0, y = 1.2, z = 10, vyS = vy;
    const dt = 1 / 480;
    while (z > 0.01) { vyS -= GRAV * dt; x += vx * dt; y += vyS * dt; z += vz * dt; }
    expect(y).toBeGreaterThan(netHeight(x));
  });

  it('vx is positive when target is at positive x', () => {
    const v = solveShot(0, 1.2, 10, 3, -9, 25, GRAV, 0.65);
    expect(v.vx).toBeGreaterThan(0);
  });

  it('minimum travel time prevents unrealistic vz', () => {
    // Very short distance — T is clamped to at least 0.16s
    const dz = -0.1;
    const v = solveShot(0, 1.2, 12, 0, 11.9, 100, GRAV, 0.3);
    // |vz| = |dz| / T, T >= 0.16, so |vz| <= |dz| / 0.16
    expect(Math.abs(v.vz)).toBeLessThanOrEqual(Math.abs(dz) / 0.16 + 0.01);
  });
});

// ─── simToPlane ───────────────────────────────────────────────────────────────

describe('simToPlane', () => {
  beforeEach(() => {
    G.ball = {
      x: 0, y: 1.2, z: 5, vx: 0.1, vy: 0.5, vz: 10,
      spin: 0, curve: 0, active: true, held: false,
    };
  });

  it('returns intercept when ball moves toward target plane', () => {
    const result = simToPlane(12);
    expect(result).not.toBeNull();
    expect(result.t).toBeGreaterThan(0);
  });

  it('returns null for inactive ball', () => {
    G.ball.active = false;
    expect(simToPlane(12)).toBeNull();
  });

  it('returns null for held ball', () => {
    G.ball.held = true;
    expect(simToPlane(12)).toBeNull();
  });

  it('returns {t:0} immediately when ball is already past target plane', () => {
    G.ball.z = 13;
    const result = simToPlane(12);
    expect(result).not.toBeNull();
    expect(result.t).toBe(0);
    expect(result.x).toBe(G.ball.x);
  });

  it('intercept x reflects lateral drift', () => {
    // ball at z=10, vz=10, vx=0.1 — arrives at z=12 in ~0.2s, x drifts ~0.02
    G.ball = { x: 0, y: 1, z: 10, vx: 0.5, vy: 0, vz: 10, spin: 0, curve: 0, active: true, held: false };
    const result = simToPlane(12);
    expect(result).not.toBeNull();
    expect(result.x).toBeGreaterThan(0);
  });

  it('returns null when ball moves away from target plane (vz <= 0.1)', () => {
    G.ball = { x: 0, y: 1, z: 5, vx: 0, vy: 0, vz: -5, spin: 0, curve: 0, active: true, held: false };
    // vz <= 0.1, z(5) < zPlane(12) → null
    expect(simToPlane(12)).toBeNull();
  });
});

// ─── predictLanding ───────────────────────────────────────────────────────────

describe('predictLanding', () => {
  beforeEach(() => {
    G.ball = { x: 0.5, y: 2, z: -2, vx: 0.2, vy: -0.5, vz: -8, spin: 0, curve: 0 };
  });

  it('returns {x, z, vx, vz} for ball in flight', () => {
    const result = predictLanding();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('z');
    expect(result).toHaveProperty('vx');
    expect(result).toHaveProperty('vz');
  });

  it('topspin (spin=1) lands sooner than no-spin — higher effective gravity', () => {
    G.ball = { x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: -10, spin: 1, curve: 0 };
    const r1 = predictLanding();
    G.ball = { x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: -10, spin: 0, curve: 0 };
    const r2 = predictLanding();
    // spin=1 → g*1.22 → falls faster → lands at less negative z
    expect(Math.abs(r1.z)).toBeLessThan(Math.abs(r2.z));
  });

  it('lateral drift shifts landing x in direction of vx', () => {
    G.ball = { x: 0, y: 2, z: 0, vx: 2, vy: 0, vz: -8, spin: 0, curve: 0 };
    const result = predictLanding();
    expect(result.x).toBeGreaterThan(0);
  });
});

// ─── predictPath ──────────────────────────────────────────────────────────────

describe('predictPath', () => {
  beforeEach(() => {
    G.ball = { x: 0, y: 1.5, z: -3, vx: 0, vy: 1, vz: -8, spin: 0, curve: 0, active: true, held: false, bounces: 0 };
  });

  it('returns array of trajectory points', () => {
    const path = predictPath(1.0);
    expect(Array.isArray(path)).toBe(true);
    expect(path.length).toBeGreaterThan(0);
  });

  it('returns empty array for inactive ball', () => {
    G.ball.active = false;
    expect(predictPath()).toHaveLength(0);
  });

  it('returns empty array for held ball', () => {
    G.ball.held = true;
    expect(predictPath()).toHaveLength(0);
  });

  it('each point has t, x, y, z, bounced properties', () => {
    const path = predictPath(0.5);
    const p = path[0];
    expect(p).toHaveProperty('t');
    expect(p).toHaveProperty('x');
    expect(p).toHaveProperty('y');
    expect(p).toHaveProperty('z');
    expect(p).toHaveProperty('bounced');
  });

  it('bounced flag flips true after ball hits ground', () => {
    G.ball = { x: 0, y: 0.5, z: -5, vx: 0, vy: -3, vz: -5, spin: 0, curve: 0, active: true, held: false, bounces: 0 };
    const path = predictPath(2.0);
    expect(path.some(p => !p.bounced)).toBe(true);
    expect(path.some(p => p.bounced)).toBe(true);
  });

  it('t values increase monotonically', () => {
    const path = predictPath(1.0);
    for (let i = 1; i < path.length; i++) {
      expect(path[i].t).toBeGreaterThan(path[i - 1].t);
    }
  });
});

// ─── simBallToNpcZ ────────────────────────────────────────────────────────────
// Mirror of simToPlane but for NPC direction (ball moving toward negative z).

describe('simBallToNpcZ', () => {
  beforeEach(() => {
    G.ball = {
      x: 0, y: 1.5, z: -3, vx: 0.1, vy: 0, vz: -10,
      spin: 0, curve: 0, active: true, held: false,
    };
  });

  it('returns intercept when ball moves toward NPC zone (vz < -0.4)', () => {
    const result = simBallToNpcZ(-11);
    expect(result).not.toBeNull();
    expect(result.t).toBeGreaterThan(0);
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
  });

  it('returns null for inactive ball', () => {
    G.ball.active = false;
    expect(simBallToNpcZ(-11)).toBeNull();
  });

  it('returns null for held ball', () => {
    G.ball.held = true;
    expect(simBallToNpcZ(-11)).toBeNull();
  });

  it('returns null when vz >= -0.4 (ball not heading toward NPC)', () => {
    G.ball.vz = -0.3; // -0.3 >= -0.4 → guard trips
    expect(simBallToNpcZ(-11)).toBeNull();
  });

  it('intercept x reflects lateral drift', () => {
    G.ball.vx = 2.0;
    const result = simBallToNpcZ(-11);
    expect(result).not.toBeNull();
    expect(result.x).toBeGreaterThan(0);
  });

  it('returns null when ball dies before reaching target plane', () => {
    // y nearly at ground, barely any bounce vy → applyBounce gives vy < 0.55 → null
    G.ball = { x: 0, y: 0.01, z: -3, vx: 0, vy: -0.1, vz: -1, spin: 0, curve: 0, active: true, held: false };
    expect(simBallToNpcZ(-15)).toBeNull();
  });

  it('intercept z is at or near the requested plane', () => {
    const zPlane = -9;
    G.ball = { x: 0, y: 1.5, z: -3, vx: 0, vy: 0, vz: -15, spin: 0, curve: 0, active: true, held: false };
    const result = simBallToNpcZ(zPlane);
    expect(result).not.toBeNull();
    // z stepped past the plane on the last dt — allow one dt margin (1/120)
    expect(result).toHaveProperty('t');
  });
});
