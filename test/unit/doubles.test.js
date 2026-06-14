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
import { updateNPC, updateNPC2, updatePartner } from '../../js/npc.js';
import { hitBall } from '../../js/ball.js';
import { withSeed } from '../helpers/seedRng.js';

// ─── Shared setup ─────────────────────────────────────────────────────────────

function setupDoubles(ballOverrides = {}) {
  G.state = 'live';
  G.diffKey = 'medium';
  G.matchType = 'doubles';
  G.rally = 2;
  G.mode = 'match';
  G.server = 1;
  G.serveOrder = [2, 0, 3, 1];
  G.serveOrderIdx = 0;
  G.score = { pts:[0,0], games:[0,0], sets:[0,0], setHist:[], tb:false, tbPts:[0,0], tbStart:0, done:false, winner:null };
  G.npcMem = { serve: { deuce: [], ad: [] }, lastServeRec: null, rallyX: 0 };
  G.particles = [];
  G.bounceMarks = [];
  G.cpuHitter = null;
  G.receiverEntity = 0;
  G.ball = {
    x: 2, y: 1.5, z: -3, vx: 0, vy: -0.5, vz: -8,
    spin: 0, curve: 0, active: true, held: false,
    lastHitter: 0, bounces: 1, isServe: false, netHit: false,
    trail: [], squashT: 0, hitFlash: null,
    ...ballOverrides,
  };
  // npc owns the right half (homeSide=1), npc2 owns the left half (homeSide=-1)
  G.npc = {
    x: 2.6, z: -11, vx: 0, vz: 0,
    cool: 0, reactT: 0, plan: null,
    tgt: { x: 2.6, z: -11 }, anim: null, netMode: false, backT: 0,
    homeSide: 1,
  };
  G.npc2 = {
    x: -2.6, z: -11, vx: 0, vz: 0,
    cool: 0, reactT: 0, plan: null,
    tgt: { x: -2.6, z: -11 }, anim: null, netMode: false, backT: 0,
    homeSide: -1,
  };
  G.player = { x: 2, z: 11, vx: 0, vz: 0, anim: null, cool: 0, recover: 0, antSide: 0 };
  G.partner = null;
}

function addPartner(overrides = {}) {
  G.partner = {
    x: -2, z: 11, vx: 0, vz: 0,
    cool: 0, recover: 0, anim: null,
    netMode: false, homeSide: -1,
    tgt: { x: -2, z: 11 },
    ...overrides,
  };
}

// ─── ensureHomeSide ───────────────────────────────────────────────────────────

describe('doubles: ensureHomeSide (via updateNPC)', () => {
  it('assigns homeSide=1 when npc.x > 0 and homeSide unset', () => {
    setupDoubles();
    G.npc.homeSide = 0; // invalid — will be set by ensureHomeSide
    G.npc.x = 2.6;
    updateNPC(1 / 60);
    expect(G.npc.homeSide).toBe(1);
  });

  it('assigns homeSide=-1 when npc.x < 0 and homeSide unset', () => {
    setupDoubles();
    G.npc.homeSide = 0;
    G.npc.x = -2.6;
    updateNPC(1 / 60);
    expect(G.npc.homeSide).toBe(-1);
  });

  it('keeps valid homeSide unchanged even if entity crossed midline', () => {
    setupDoubles();
    G.npc.homeSide = 1; // already valid → not overwritten
    G.npc.x = -1;       // currently on left side, but home is right
    updateNPC(1 / 60);
    expect(G.npc.homeSide).toBe(1);
  });
});

// ─── pickCpuHitter ────────────────────────────────────────────────────────────

describe('doubles: pickCpuHitter (via updateNPC)', () => {
  beforeEach(() => setupDoubles());

  it('sets cpuHitter to npc when ball lands on positive x (npc.homeSide=1)', () => {
    // Ball at x=2 → predictLanding returns positive x → owner = npc
    G.ball.x = 2;
    updateNPC(1 / 60);
    expect(G.cpuHitter).toBe(G.npc);
  });

  it('sets cpuHitter to npc2 when ball lands on negative x (npc2.homeSide=-1)', () => {
    // Ball at x=-2 → predictLanding returns negative x → owner = npc2
    G.ball.x = -2;
    updateNPC(1 / 60);
    expect(G.cpuHitter).toBe(G.npc2);
  });

  it('sets cpuHitter=null when cpu already hit the ball (lastHitter=1)', () => {
    G.ball.lastHitter = 1; // cpu hit, so not incoming
    G.cpuHitter = G.npc;   // was set from previous frame
    updateNPC(1 / 60);
    expect(G.cpuHitter).toBeNull();
  });

  it('other entity poaches when clearly closer by >1.4 units', () => {
    // Ball landing at x=2 (npc's side), but npc2 is placed right on top of the ball
    // and npc is far away — npc2 should poach
    G.npc.x = -4;   // far from ball
    G.npc2.x = 2;   // right on ball x — very close
    G.ball.x = 2;
    updateNPC(1 / 60);
    // npc2 should be closer to landing (|2-2|=0) vs npc (|-4-2|=6) → poach
    expect(G.cpuHitter).toBe(G.npc2);
  });

  it('hysteresis keeps current hitter when challenger is within 0.7 units', () => {
    // Set cpuHitter=npc2 already; npc is slightly closer but not by 0.7
    G.cpuHitter = G.npc2;
    G.npc.x = 1.8;   // slightly closer to ball at x=2, but gap < 0.7
    G.npc2.x = 2.2;
    G.ball.x = 2;
    updateNPC(1 / 60);
    // npc is barely closer → hysteresis should keep npc2
    // dN ≈ |2-1.8| = 0.2 + z component, dN2 ≈ |2-2.2| = 0.2 + z → nearly equal
    // npc2 has dChosen and npc has dPrev: if dPrev <= dChosen + 0.7 → keep npc2
    expect(G.cpuHitter).toBe(G.npc2);
  });
});

// ─── Non-hitter cover positions ───────────────────────────────────────────────

describe('doubles: non-hitter baseline cover', () => {
  it('non-hitters target baseline z=-10.8 when cpu has the ball', () => {
    setupDoubles({ lastHitter: 1 }); // cpu hit, so no hitter → both cover
    updateNPC(1 / 60);
    expect(G.npc.tgt.z).toBeCloseTo(-10.8);
  });

  it('non-hitter x-target shifts toward ball x for triangle positioning', () => {
    setupDoubles({ lastHitter: 1, x: 4 }); // ball far right
    updateNPC(1 / 60);
    // shift = clamp(4*0.28, -1.6, 1.6) = 1.12; npc(homeSide=1): tx = 2.6+1.12 = 3.72
    // npc was at 2.6, target is 3.72 → should have moved right
    // Just check tgt.x > npc baseline (2.6)
    expect(G.npc.tgt.x).toBeGreaterThan(2.6);
  });

  it('updateNPC2 sets non-hitter cover target too', () => {
    setupDoubles({ lastHitter: 1 });
    updateNPC(1 / 60);  // sets cpuHitter=null (isPrimary)
    updateNPC2(1 / 60);
    expect(G.npc2.tgt.z).toBeCloseTo(-10.8);
  });
});

// ─── Net mode cover ───────────────────────────────────────────────────────────

describe('doubles: net mode cover position', () => {
  it('non-hitter at net targets z=-2.7 instead of baseline', () => {
    setupDoubles({ lastHitter: 1 });
    G.npc.netMode = true;
    updateNPC(1 / 60);
    expect(G.npc.tgt.z).toBeCloseTo(-2.7);
  });
});

// ─── cpuHit triggers in doubles ───────────────────────────────────────────────

describe('doubles: cpuHit trigger', () => {
  beforeEach(() => {
    hitBall.mockClear();
    setupDoubles();
  });

  it('designated hitter calls hitBall when in range with animation past gate', () => {
    // Ball at positive x → npc is owner/hitter; place npc at ball position
    G.ball.x = 2;
    G.npc.x = 2;
    G.npc.z = G.ball.z;
    G.npc.cool = 0;
    G.npc.anim = { t: 0.15, side: 1, type: 'ground', contact: null };
    withSeed(42, () => updateNPC(1 / 60));
    expect(hitBall).toHaveBeenCalled();
  });

  it('non-designated hitter (npc2) does NOT call hitBall even if in range', () => {
    // Ball at positive x → npc is hitter; npc2 should not hit
    G.ball.x = 2;
    G.npc2.x = 2;              // npc2 is also at ball position
    G.npc2.z = G.ball.z;
    G.npc2.cool = 0;
    G.npc2.anim = { t: 0.15, side: 1, type: 'ground', contact: null };
    // Run npc first (primary, sets G.cpuHitter=npc) then npc2
    updateNPC(1 / 60);
    hitBall.mockClear();       // ignore any hit from npc
    updateNPC2(1 / 60);
    expect(hitBall).not.toHaveBeenCalled();
  });
});

// ─── updateNPC2 guards ────────────────────────────────────────────────────────

describe('updateNPC2 — mode guards', () => {
  it('does nothing in singles mode', () => {
    setupDoubles();
    G.matchType = 'singles';
    const x0 = G.npc2.x;
    updateNPC2(1 / 60);
    expect(G.npc2.x).toBe(x0);
  });

  it('does nothing when npc2 is null', () => {
    setupDoubles();
    G.npc2 = null;
    expect(() => updateNPC2(1 / 60)).not.toThrow();
  });

  it('moves npc2 when conditions are met', () => {
    setupDoubles({ lastHitter: 1 }); // non-incoming → cover mode
    G.npc2.x = -2.6;
    updateNPC(1 / 60);   // primary sets G.cpuHitter=null
    const x0 = G.npc2.x;
    updateNPC2(1 / 60);
    // npc2's cover target for ball.x=2: shift=0.56, tx=clamp(-2.6+0.56)=-2.04
    // npc2 moves toward -2.04 from -2.6 → moves right
    expect(G.npc2.x).toBeGreaterThan(x0);
  });
});

// ─── updatePartner guards ─────────────────────────────────────────────────────

describe('updatePartner — mode guards', () => {
  it('does nothing in singles mode', () => {
    setupDoubles();
    addPartner();
    G.matchType = 'singles';
    const x0 = G.partner.x;
    updatePartner(1 / 60);
    expect(G.partner.x).toBe(x0);
  });

  it('does nothing when partner is null', () => {
    setupDoubles();
    G.partner = null;
    expect(() => updatePartner(1 / 60)).not.toThrow();
  });

  it('partner moves toward cover position on player side', () => {
    setupDoubles();
    addPartner({ x: 0, z: 11, homeSide: -1 });
    // ball.lastHitter=0 → incoming=false for partner → covers
    // shift = clamp(ball.x*0.22) = clamp(2*0.22)=0.44
    // tx = clamp(-1*2.4 + 0.44) = clamp(-1.96) = -1.96
    // partner at x=0, target at -1.96 → should move left
    const x0 = G.partner.x; // 0
    updatePartner(1 / 60);
    expect(G.partner.x).toBeLessThan(x0);
  });

  it('partner cooldown decrements each frame', () => {
    setupDoubles();
    addPartner({ cool: 0.5 });
    updatePartner(1 / 60);
    expect(G.partner.cool).toBeLessThan(0.5);
  });
});
