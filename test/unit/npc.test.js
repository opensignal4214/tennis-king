import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../js/audio.js', () => ({
  sHit: vi.fn(), sBounce: vi.fn(), sNet: vi.fn(), sOut: vi.fn(),
}));
vi.mock('../../js/ball.js', () => ({ hitBall: vi.fn() }));
vi.mock('../../js/serve.js', () => ({
  startToss: vi.fn(), fireServe: vi.fn(), setupServe: vi.fn(),
}));
vi.mock('../../js/scoring.js', () => ({
  servingPlayer: vi.fn(() => 0),
  serveSide: vi.fn(() => 'deuce'),
}));
vi.mock('../../js/logger.js', () => ({ logEvent: vi.fn() }));
vi.mock('../../js/hud.js', () => ({ refreshHUD: vi.fn() }));
vi.mock('../../js/match.js', () => ({ endPoint: vi.fn() }));

import { G } from '../../js/state.js';
import { updateNPC } from '../../js/npc.js';
import { hitBall } from '../../js/ball.js';
import { withSeed } from '../helpers/seedRng.js';

function setup(overrides = {}) {
  G.state = 'live';
  G.diffKey = 'medium';
  G.matchType = 'singles';
  G.rally = 2;
  G.ball = {
    x: 1, y: 1.5, z: -3, vx: 0.2, vy: -0.5, vz: -8,
    spin: 0, curve: 0, active: true, held: false,
    lastHitter: 0, bounces: 1, isServe: false, netHit: false,
    trail: [], squashT: 0, hitFlash: null,
  };
  G.npc = {
    x: 0, z: -11, vx: 0, vz: 0,
    cool: 0, reactT: 0, plan: null,
    tgt: { x: 0, z: -11 }, anim: null, netMode: false, backT: 0,
  };
  G.player = { x: 0, z: 12, vx: 0, vz: 0, anim: null, cool: 0, recover: 0, antSide: 0 };
  G.npc2 = null;
  G.partner = null;
  G.npcMem = { serve: { deuce: [], ad: [] }, lastServeRec: null, rallyX: 0 };
  Object.assign(G, overrides);
}

// ─── State guard ──────────────────────────────────────────────────────────────

describe('updateNPC — state guard', () => {
  it('does not move NPC when state is "menu"', () => {
    setup({ state: 'menu' });
    const x0 = G.npc.x;
    updateNPC(1 / 60);
    expect(G.npc.x).toBe(x0);
  });

  it('does not move NPC when state is "point"', () => {
    setup({ state: 'point' });
    const x0 = G.npc.x;
    updateNPC(1 / 60);
    expect(G.npc.x).toBe(x0);
  });
});

// ─── Movement ─────────────────────────────────────────────────────────────────

describe('updateNPC — movement', () => {
  it('NPC moves toward target when target is to the right', () => {
    setup();
    G.npc.plan = { x: 4, z: -5 };
    G.npc.tgt = { x: 4, z: -5 };
    const x0 = G.npc.x; // 0
    updateNPC(1 / 60);
    expect(G.npc.x).toBeGreaterThan(x0);
  });

  it('NPC moves toward target when target is to the left', () => {
    setup();
    // Ball at negative x → tgt.x computed as clamp(ball.x + vx*0.13) → negative → NPC moves left
    G.ball.x = -3;
    G.ball.vx = -0.1;
    const x0 = G.npc.x; // 0
    updateNPC(1 / 60);
    expect(G.npc.x).toBeLessThan(x0);
  });

  it('NPC displacement per frame does not exceed speed budget', () => {
    setup();
    G.npc.plan = { x: 100, z: -5 };
    G.npc.tgt = { x: 100, z: -5 };
    const x0 = G.npc.x;
    updateNPC(1 / 60);
    // medium speed = 5.2; one frame at max = 5.2 * (1/60) ≈ 0.087 + small accel buffer
    const moved = Math.abs(G.npc.x - x0);
    expect(moved).toBeLessThanOrEqual(0.12);
  });

  it('NPC stride accumulates while moving', () => {
    setup();
    G.npc.stride = 0;
    G.npc.plan = { x: 4, z: -5 };
    G.npc.tgt = { x: 4, z: -5 };
    updateNPC(1 / 60);
    expect(G.npc.stride).toBeGreaterThan(0);
  });
});

// ─── Reaction timer and plan ──────────────────────────────────────────────────

describe('updateNPC — plan creation', () => {
  it('decrements reactT while it is positive', () => {
    setup();
    G.npc.reactT = 0.24;
    G.npc.plan = null;
    updateNPC(1 / 60);
    expect(G.npc.reactT).toBeLessThan(0.24);
    expect(G.npc.plan).toBeNull();
  });

  it('creates a plan once reactT reaches 0', () => {
    setup();
    G.npc.reactT = 0;
    G.npc.plan = null;
    updateNPC(1 / 60);
    expect(G.npc.plan).not.toBeNull();
  });

  it('plan x is within court lateral bounds [-7.5, 7.5]', () => {
    setup();
    G.npc.reactT = 0;
    G.npc.plan = null;
    withSeed(7, () => updateNPC(1 / 60));
    if (G.npc.plan) {
      expect(G.npc.plan.x).toBeGreaterThanOrEqual(-7.5);
      expect(G.npc.plan.x).toBeLessThanOrEqual(7.5);
    }
  });

  it('plan z is within NPC court depth [-15, -0.9]', () => {
    setup();
    G.npc.reactT = 0;
    G.npc.plan = null;
    withSeed(7, () => updateNPC(1 / 60));
    if (G.npc.plan) {
      expect(G.npc.plan.z).toBeGreaterThanOrEqual(-15);
      expect(G.npc.plan.z).toBeLessThanOrEqual(-0.9);
    }
  });
});

// ─── Hit trigger ──────────────────────────────────────────────────────────────

describe('updateNPC — hit trigger', () => {
  beforeEach(() => hitBall.mockClear());

  it('calls hitBall when NPC is at ball position with active animation past gate', () => {
    setup();
    // Pre-set plan to skip plan-creation path
    G.npc.plan = { x: G.ball.x, z: G.ball.z };
    G.npc.x = G.ball.x;
    G.npc.z = G.ball.z;
    G.npc.cool = 0;
    G.npc.anim = { t: 0.15, side: 1, type: 'ground', contact: null };
    // seed chosen so first random() >> d.whiff(0.015), preventing a whiff
    withSeed(42, () => updateNPC(1 / 60));
    expect(hitBall).toHaveBeenCalled();
  });

  it('does not hit when cooldown is active', () => {
    setup();
    G.npc.plan = { x: G.ball.x, z: G.ball.z };
    G.npc.x = G.ball.x;
    G.npc.z = G.ball.z;
    G.npc.cool = 0.5;
    G.npc.anim = { t: 0.15, side: 1, type: 'ground', contact: null };
    updateNPC(1 / 60);
    expect(hitBall).not.toHaveBeenCalled();
  });

  it('does not hit when animation has not reached gate time', () => {
    setup();
    G.npc.plan = { x: G.ball.x, z: G.ball.z };
    G.npc.x = G.ball.x;
    G.npc.z = G.ball.z;
    G.npc.cool = 0;
    // anim.t = 0.02, gate for 'ground' is 0.10 → not ready
    G.npc.anim = { t: 0.02, side: 1, type: 'ground', contact: null };
    updateNPC(1 / 60);
    expect(hitBall).not.toHaveBeenCalled();
  });

  it('does not hit when ball is on NPC side (lastHitter=1)', () => {
    setup({ ball: { ...G.ball, lastHitter: 1 } });
    // Re-assign since Object.assign may not deeply merge
    G.ball.lastHitter = 1;
    G.npc.x = G.ball.x;
    G.npc.z = G.ball.z;
    G.npc.cool = 0;
    G.npc.anim = { t: 0.15, side: 1, type: 'ground', contact: null };
    updateNPC(1 / 60);
    expect(hitBall).not.toHaveBeenCalled();
  });
});

// ─── Cooldown decay ───────────────────────────────────────────────────────────

describe('updateNPC — cooldown decay', () => {
  it('cool decrements each frame', () => {
    setup();
    G.npc.cool = 0.5;
    updateNPC(1 / 60);
    expect(G.npc.cool).toBeLessThan(0.5);
  });
});
