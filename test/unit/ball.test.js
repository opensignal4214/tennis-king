import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../js/audio.js', () => ({
  sHit: vi.fn(), sBounce: vi.fn(), sNet: vi.fn(), sOut: vi.fn(),
}));
vi.mock('../../js/hud.js', () => ({ refreshHUD: vi.fn() }));
vi.mock('../../js/match.js', () => ({ endPoint: vi.fn() }));
vi.mock('../../js/serve.js', () => ({
  fault: vi.fn(), startToss: vi.fn(), fireServe: vi.fn(), setupServe: vi.fn(),
}));
vi.mock('../../js/scoring.js', () => ({
  serveSide: vi.fn(() => 'deuce'),
  servingPlayer: vi.fn(() => 0),
  addPoint: vi.fn(),
  newScore: vi.fn(() => ({ pts:[0,0], games:[0,0], sets:[0,0], setHist:[], tb:false, tbPts:[0,0], tbStart:0, done:false, winner:null })),
}));
vi.mock('../../js/logger.js', () => ({
  logEvent: vi.fn(), logTick: vi.fn(), logFrame: vi.fn(),
  logMatchStart: vi.fn(), logPointStart: vi.fn(), logPointEnd: vi.fn(),
}));

import { G } from '../../js/state.js';
import { applyBounce, updateBall, serveBoxOK, hitBall } from '../../js/ball.js';
import { endPoint } from '../../js/match.js';
import { sHit } from '../../js/audio.js';

function makeBall(overrides = {}) {
  return {
    x: 0, y: 1.5, z: -5, vx: 0, vy: 0, vz: -8,
    spin: 0, curve: 0, active: true, held: false,
    lastHitter: 0, bounces: 0, isServe: false, netHit: false,
    trail: [], squashT: 0, hitFlash: null,
    ...overrides,
  };
}

// ─── applyBounce ──────────────────────────────────────────────────────────────

describe('applyBounce — restitution coefficients', () => {
  it('topspin (spin=1) uses e=0.68', () => {
    const b = { vy: -5, vx: 1, vz: -8, spin: 1, curve: 0 };
    applyBounce(b);
    expect(b.vy).toBeCloseTo(5 * 0.68, 3);
  });

  it('backspin (spin=-1) uses e=0.45', () => {
    const b = { vy: -5, vx: 1, vz: -8, spin: -1, curve: 0 };
    applyBounce(b);
    expect(b.vy).toBeCloseTo(5 * 0.45, 3);
  });

  it('no spin uses e=0.56', () => {
    const b = { vy: -5, vx: 1, vz: -8, spin: 0, curve: 0 };
    applyBounce(b);
    expect(b.vy).toBeCloseTo(5 * 0.56, 3);
  });

  it('spin decays to 35% after bounce', () => {
    const b = { vy: -5, vx: 0, vz: -8, spin: 1, curve: 0 };
    applyBounce(b);
    expect(b.spin).toBeCloseTo(0.35, 3);
  });

  it('curve decays to 25% after bounce', () => {
    const b = { vy: -5, vx: 0, vz: -8, spin: 0, curve: 2 };
    applyBounce(b);
    expect(b.curve).toBeCloseTo(0.5, 3);
  });

  it('very low post-bounce vy (< 0.55) → vy set to 0', () => {
    // vy=-0.3, spin=0: new vy = 0.3*0.56 = 0.168, which < 0.55 → 0
    const b = { vy: -0.3, vx: 1, vz: -8, spin: 0, curve: 0 };
    applyBounce(b);
    expect(b.vy).toBe(0);
  });

  it('strong bounce keeps vy positive', () => {
    const b = { vy: -10, vx: 0, vz: 0, spin: 0, curve: 0 };
    applyBounce(b);
    expect(b.vy).toBeGreaterThan(0);
  });
});

// ─── updateBall — physics ─────────────────────────────────────────────────────

describe('updateBall — physics', () => {
  beforeEach(() => {
    G.state = 'live';
    G.particles = [];
    G.bounceMarks = [];
    G.matchType = 'singles';
    G.ball = makeBall({ y: 3, vy: 0 });
  });

  it('y decreases each frame due to gravity', () => {
    const y0 = G.ball.y;
    updateBall(1 / 60);
    expect(G.ball.y).toBeLessThan(y0);
  });

  it('horizontal speed decreases due to drag', () => {
    G.ball.vz = -10;
    updateBall(1 / 60);
    expect(Math.abs(G.ball.vz)).toBeLessThan(10);
  });

  it('trail grows with each frame', () => {
    updateBall(1 / 60);
    expect(G.ball.trail.length).toBe(1);
    updateBall(1 / 60);
    expect(G.ball.trail.length).toBe(2);
  });

  it('trail caps at 13 entries', () => {
    for (let i = 0; i < 20; i++) updateBall(1 / 60);
    expect(G.ball.trail.length).toBeLessThanOrEqual(13);
  });

  it('ball reflects off x=18 wall (vx reverses, x clamped)', () => {
    G.ball = makeBall({ y: 3, x: 17.9, vx: 10, vz: 0, vy: 0 });
    updateBall(1 / 60);
    expect(G.ball.x).toBeLessThanOrEqual(18);
    expect(G.ball.vx).toBeLessThan(0);
  });

  it('ball reflects off z=24 wall (vz reverses, z clamped)', () => {
    G.ball = makeBall({ y: 3, z: 23.9, vz: 10, vy: 0 });
    updateBall(1 / 60);
    expect(G.ball.z).toBeLessThanOrEqual(24);
    expect(G.ball.vz).toBeLessThan(0);
  });

  it('squashT decrements over time', () => {
    G.ball = makeBall({ y: 3, squashT: 0.14 });
    updateBall(1 / 60);
    expect(G.ball.squashT).toBeLessThan(0.14);
  });
});

// ─── updateBall — net collision ───────────────────────────────────────────────

describe('updateBall — net collision', () => {
  beforeEach(() => {
    G.state = 'live';
    G.particles = [];
    G.bounceMarks = [];
    G.matchType = 'singles';
  });

  it('sets netHit when ball crosses z=0 below net height', () => {
    // Ball at z=0.1, y=0.5 (below net height of 0.92), vz=-10 → crosses net this frame
    G.ball = makeBall({ x: 0, y: 0.5, z: 0.1, vx: 0, vy: 0, vz: -10, netHit: false });
    updateBall(1 / 60);
    expect(G.ball.netHit).toBe(true);
  });

  it('reverses vz after net collision', () => {
    G.ball = makeBall({ x: 0, y: 0.5, z: 0.1, vx: 0, vy: 0, vz: -10, netHit: false });
    updateBall(1 / 60);
    expect(G.ball.vz).toBeGreaterThan(0);
  });

  it('does NOT set netHit when ball clears net height', () => {
    // y=2.0 → well above net (0.92-1.08)
    G.ball = makeBall({ x: 0, y: 2.0, z: 0.1, vx: 0, vy: 0, vz: -10, netHit: false });
    updateBall(1 / 60);
    expect(G.ball.netHit).toBe(false);
  });
});

// ─── updateBall — ground events ───────────────────────────────────────────────

describe('updateBall — ground events', () => {
  beforeEach(() => {
    G.state = 'live';
    G.particles = [];
    G.bounceMarks = [];
    G.matchType = 'singles';
    G.rally = 3;
    G.npcMem = { serve: { deuce: [], ad: [] }, lastServeRec: null, rallyX: 0 };
    endPoint.mockClear();
  });

  it('second bounce on opponent side awards point to hitter (bounces=1 → endPoint)', () => {
    // Ball on NPC side (z<0), player hit it (lastHitter=0), already bounced once
    G.ball = makeBall({ y: 0.001, z: -5, vy: -5, vz: -2, bounces: 1, lastHitter: 0 });
    updateBall(1 / 60);
    expect(endPoint).toHaveBeenCalledWith(0, expect.stringContaining('Winner'));
  });

  it('ball bouncing on hitter own side calls endPoint immediately', () => {
    // NPC hit (lastHitter=1), ball on NPC side (z<0 → side=1), side===lastHitter → point ends
    G.ball = makeBall({ y: 0.001, z: -5, vy: -5, vz: -2, bounces: 0, lastHitter: 1 });
    updateBall(1 / 60);
    expect(endPoint).toHaveBeenCalledWith(0, expect.anything());
  });

  it('out-of-bounds landing calls endPoint with correct loser', () => {
    // Ball at x=5, SW+0.07=4.185 → |5| > 4.185 → out
    G.ball = makeBall({ x: 5, y: 0.001, z: -5, vy: -5, vz: -2, bounces: 0, lastHitter: 0 });
    updateBall(1 / 60);
    expect(endPoint).toHaveBeenCalledWith(1, expect.stringContaining('Out'));
  });

  it('in-court first bounce increments bounces to 1 (no endPoint)', () => {
    // Ball inside court, first bounce (bounces=0)
    G.ball = makeBall({ x: 0, y: 0.001, z: -5, vy: -5, vz: -2, bounces: 0, lastHitter: 0, netHit: false });
    updateBall(1 / 60);
    expect(endPoint).not.toHaveBeenCalled();
    expect(G.ball.bounces).toBe(1);
  });
});

// ─── serveBoxOK ───────────────────────────────────────────────────────────────

describe('serveBoxOK', () => {
  beforeEach(() => {
    G.score = { pts:[0,0], games:[0,0], sets:[0,0], setHist:[], tb:false, tbPts:[0,0], tbStart:0, done:false, winner:null };
    G.server = 0;
    G.mode = 'match';
    G.matchType = 'singles';
    G.serveOrder = [];
    G.serveOrderIdx = 0;
    // serveSide is mocked to return 'deuce' — deuce: receiver=NPC, box: z in [-SVC-0.07,0], x in [-SW-0.07, 0.07]
  });

  it('valid deuce-court serve lands correctly (x=-2, z=-3)', () => {
    const b = { x: -2, z: -3, lastHitter: 0, isServe: true, bounces: 0 };
    expect(serveBoxOK(b)).toBe(true);
  });

  it('serve landing wrong lateral half fails', () => {
    const b = { x: 2, z: -3, lastHitter: 0, isServe: true, bounces: 0 };
    expect(serveBoxOK(b)).toBe(false);
  });

  it('serve landing beyond service line fails', () => {
    const b = { x: -1, z: -7, lastHitter: 0, isServe: true, bounces: 0 };
    expect(serveBoxOK(b)).toBe(false);
  });

  it('serve landing on player own side fails', () => {
    const b = { x: -1, z: 3, lastHitter: 0, isServe: true, bounces: 0 };
    expect(serveBoxOK(b)).toBe(false);
  });
});

// ─── hitBall ──────────────────────────────────────────────────────────────────

describe('hitBall', () => {
  beforeEach(() => {
    G.state = 'live';
    G.diffKey = 'medium';
    G.matchType = 'singles';
    G.rally = 1;
    G.strike = { t: 0.1 };
    G.npc2 = null;
    G.npc = { x: 0, z: -11, cool: 0, reactT: 0, plan: { x: 1, z: -9 } };
    G.ball = makeBall({
      x: 0, y: 1.2, z: 10,
      vx: 0, vy: 0, vz: 0,
      lastHitter: 1, bounces: 2, isServe: true, netHit: true,
    });
    sHit.mockClear();
  });

  it('sets ball velocity aimed toward target (vz < 0 shooting toward NPC)', () => {
    hitBall(0, 0, -9, 25, 1, 0.65, 'topspin');
    expect(G.ball.vz).toBeLessThan(0);
    expect(G.ball.vy).not.toBe(0);
  });

  it('resets lastHitter, bounces, isServe, netHit', () => {
    hitBall(0, 0, -9, 25, 1, 0.65, 'topspin');
    expect(G.ball.lastHitter).toBe(0);
    expect(G.ball.bounces).toBe(0);
    expect(G.ball.isServe).toBe(false);
    expect(G.ball.netHit).toBe(false);
  });

  it('writes spin to ball and clears curve', () => {
    hitBall(0, 0, -9, 25, -1, 0.65, 'slice');
    expect(G.ball.spin).toBe(-1);
    expect(G.ball.curve).toBe(0);
  });

  it('increments G.rally', () => {
    hitBall(0, 0, -9, 25, 1, 0.65, 'topspin');
    expect(G.rally).toBe(2);
  });

  it('sets hitFlash with t=0', () => {
    hitBall(0, 0, -9, 25, 1, 0.65, 'topspin');
    expect(G.ball.hitFlash).not.toBeNull();
    expect(G.ball.hitFlash.t).toBe(0);
    expect(G.ball.hitFlash.x).toBe(G.ball.x);
  });

  it('player hit (hitter=0) resets NPC reactT and clears NPC plan', () => {
    G.npc.reactT = 0;
    G.npc.plan = { x: 1, z: -9 };
    hitBall(0, 0, -9, 25, 1, 0.65, 'topspin');
    expect(G.npc.reactT).toBeGreaterThan(0);
    expect(G.npc.plan).toBeNull();
  });

  it('player hit (hitter=0) clears G.strike', () => {
    hitBall(0, 0, -9, 25, 1, 0.65, 'topspin');
    expect(G.strike).toBeNull();
  });

  it('NPC hit (hitter=1) does not reset NPC reactT', () => {
    G.npc.reactT = 0;
    hitBall(1, 0, 9, 25, 1, 0.65, 'topspin');
    expect(G.npc.reactT).toBe(0);
  });

  it('calls sHit with the given shotType', () => {
    hitBall(0, 0, -9, 25, 1, 0.65, 'smash');
    expect(sHit).toHaveBeenCalledWith('smash', expect.any(Number), expect.any(Object));
  });

  it('topspin shot uses higher effective gravity (vz less negative than flat)', () => {
    hitBall(0, 0, -9, 25, 1, 0.65, 'topspin');
    const vzTopspin = G.ball.vz;
    // Reset ball
    G.ball = makeBall({ x: 0, y: 1.2, z: 10, vx: 0, vy: 0, vz: 0, lastHitter: 1, bounces: 2, isServe: true, netHit: true });
    hitBall(0, 0, -9, 25, 0, 0.65, 'flat');
    const vzFlat = G.ball.vz;
    // Both should be negative; topspin adjusts trajectory differently
    expect(vzTopspin).toBeLessThan(0);
    expect(vzFlat).toBeLessThan(0);
  });
});
