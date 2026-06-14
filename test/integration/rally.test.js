import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../js/audio.js', () => ({
  sHit: vi.fn(), sBounce: vi.fn(), sNet: vi.fn(), sOut: vi.fn(),
}));
vi.mock('../../js/hud.js', () => ({ refreshHUD: vi.fn() }));
vi.mock('../../js/match.js', () => ({ endPoint: vi.fn() }));
vi.mock('../../js/serve.js', () => ({
  fault: vi.fn(), startToss: vi.fn(), fireServe: vi.fn(), setupServe: vi.fn(),
}));
vi.mock('../../js/logger.js', () => ({
  logEvent: vi.fn(), logTick: vi.fn(), logFrame: vi.fn(),
  logMatchStart: vi.fn(), logPointStart: vi.fn(), logPointEnd: vi.fn(),
}));

// Real scoring (pure — no browser deps)
import { G } from '../../js/state.js';
import { updateBall } from '../../js/ball.js';
import { updateNPC } from '../../js/npc.js';
import { endPoint } from '../../js/match.js';
import { runFrames } from '../helpers/sim.js';

function setupGame(ballOverrides = {}) {
  G.state = 'live';
  G.diffKey = 'medium';
  G.matchType = 'singles';
  G.rally = 2;
  G.server = 0;
  G.mode = 'match';
  G.score = { pts:[0,0], games:[0,0], sets:[0,0], setHist:[], tb:false, tbPts:[0,0], tbStart:0, done:false, winner:null };
  G.serveOrder = []; G.serveOrderIdx = 0;
  G.particles = [];
  G.bounceMarks = [];
  G.npcMem = { serve: { deuce: [], ad: [] }, lastServeRec: null, rallyX: 0 };
  G.npc = { x: 0, z: -11, vx: 0, vz: 0, cool: 0, reactT: 0, plan: null, tgt: { x: 0, z: -11 }, anim: null, netMode: false, backT: 0 };
  G.player = { x: 0, z: 12, vx: 0, vz: 0, anim: null, cool: 0, recover: 0, antSide: 0 };
  G.npc2 = null;
  G.partner = null;
  G.ball = {
    x: 0, y: 1.5, z: -1, vx: 0, vy: 1.5, vz: -14,
    spin: 1, curve: 0, active: true, held: false,
    lastHitter: 0, bounces: 0, isServe: false, netHit: false,
    trail: [], squashT: 0, hitFlash: null,
    ...ballOverrides,
  };
}

// ─── NPC movement toward incoming ball ───────────────────────────────────────

describe('NPC movement toward incoming ball', () => {
  it('NPC moves in the direction of the incoming ball x', () => {
    setupGame({ x: 3, y: 1.5, z: -1, vx: 0, vy: 0.5, vz: -12 });
    const npcX0 = G.npc.x; // 0
    runFrames([updateNPC, updateBall], 30);
    // Ball is at x=3 → NPC should move right (positive x)
    expect(G.npc.x).toBeGreaterThan(npcX0);
  });

  it('NPC stays near baseline when ball is already on its side', () => {
    // Ball on NPC side (lastHitter=1), NPC should hold position, not chase
    setupGame({ lastHitter: 1, z: -8, vz: -3 });
    const z0 = G.npc.z;
    runFrames([updateNPC, updateBall], 30);
    // When lastHitter=1, NPC recovers to baseline area — z should not wildly overshoot
    expect(G.npc.z).toBeGreaterThanOrEqual(-15);
    expect(G.npc.z).toBeLessThanOrEqual(0);
  });
});

// ─── Ball out of bounds ends point ───────────────────────────────────────────

describe('ball out of bounds → endPoint', () => {
  beforeEach(() => endPoint.mockClear());

  it('wide ball (|x| > SW+margin) calls endPoint for hitter losing point', () => {
    // x=5, SW=4.115, margin=0.07 → |5| > 4.185 → out
    setupGame({ x: 5, y: 0.001, z: -5, vx: 0, vy: -5, vz: -2, bounces: 0, lastHitter: 0 });
    runFrames([updateBall], 5);
    expect(endPoint).toHaveBeenCalledWith(1, expect.stringContaining('Out'));
  });

  it('long ball (|z| > HL+margin, on NPC side) calls endPoint', () => {
    // z=-13, HL=11.885, margin=0.07 → |-13| > 11.955 → long
    setupGame({ x: 0, y: 0.001, z: -13, vx: 0, vy: -5, vz: -2, bounces: 0, lastHitter: 0 });
    runFrames([updateBall], 5);
    expect(endPoint).toHaveBeenCalledWith(1, expect.stringContaining('Out'));
  });
});

// ─── Double bounce ends point ─────────────────────────────────────────────────

describe('double bounce ends point', () => {
  beforeEach(() => endPoint.mockClear());

  it('second bounce awards point to the hitter', () => {
    // bounces=1 already → next ground contact → endPoint(lastHitter, 'Winner!')
    setupGame({ x: 0, y: 0.001, z: -5, vx: 0, vy: -5, vz: -2, bounces: 1, lastHitter: 0 });
    runFrames([updateBall], 5);
    expect(endPoint).toHaveBeenCalledWith(0, expect.stringContaining('Winner'));
  });

  it('CPU double bounce awards point to player', () => {
    setupGame({ x: 0, y: 0.001, z: 5, vx: 0, vy: -5, vz: 2, bounces: 1, lastHitter: 1 });
    runFrames([updateBall], 5);
    expect(endPoint).toHaveBeenCalledWith(1, expect.stringContaining('wins'));
  });
});

// ─── Net collision ────────────────────────────────────────────────────────────

describe('net collision integration', () => {
  beforeEach(() => endPoint.mockClear());

  it('ball barely below net gets deflected back (netHit set)', () => {
    setupGame({ x: 0, y: 0.5, z: 0.1, vx: 0, vy: 0, vz: -12, bounces: 0 });
    runFrames([updateBall], 2);
    expect(G.ball.netHit).toBe(true);
    expect(G.ball.vz).toBeGreaterThan(0);
  });

  it('ball clearly above net passes through without netHit', () => {
    setupGame({ x: 0, y: 2.5, z: 0.1, vx: 0, vy: 0, vz: -12, bounces: 0 });
    runFrames([updateBall], 2);
    expect(G.ball.netHit).toBe(false);
  });
});

// ─── Physics invariants ───────────────────────────────────────────────────────

describe('physics invariants over 120 frames (2s)', () => {
  it('ball y never goes significantly below 0', () => {
    setupGame({ x: 0, y: 3, z: -5, vx: 0.2, vy: 0.5, vz: -8 });
    let violated = false;
    for (let i = 0; i < 120; i++) {
      updateBall(1 / 60);
      if (G.ball.y < -0.02) { violated = true; break; }
    }
    expect(violated).toBe(false);
  });

  it('ball x stays within ±18 court walls', () => {
    setupGame({ x: 0, y: 3, z: -5, vx: 20, vy: 0, vz: -1 });
    for (let i = 0; i < 120; i++) updateBall(1 / 60);
    expect(Math.abs(G.ball.x)).toBeLessThanOrEqual(18.01);
  });

  it('ball loses energy: each successive bounce has lower post-bounce vy', () => {
    // Drop ball straight down; endPoint is mocked so simulation continues past first bounce
    setupGame({ x: 0, y: 3, z: -5, vx: 0, vy: 0, vz: 0, spin: 0, lastHitter: 0, bounces: 0 });
    const postBounceVys = [];
    let wasNearGround = false;

    for (let i = 0; i < 600 && postBounceVys.length < 3; i++) {
      updateBall(1 / 60);
      if (G.ball.y < 0.02 && G.ball.vy > 0 && !wasNearGround) {
        postBounceVys.push(G.ball.vy);
        wasNearGround = true;
      }
      if (G.ball.y > 0.1) wasNearGround = false;
    }

    expect(postBounceVys.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < postBounceVys.length; i++) {
      expect(postBounceVys[i]).toBeLessThan(postBounceVys[i - 1]);
    }
  });
});
