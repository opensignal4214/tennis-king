import { G } from '../../js/state.js';

export function makeBall(overrides = {}) {
  return {
    x: 0, y: 1.5, z: -5, vx: 0, vy: 0, vz: -8,
    spin: 0, curve: 0, active: true, held: false,
    lastHitter: 0, bounces: 0, isServe: false, netHit: false,
    trail: [], squashT: 0, hitFlash: null,
    ...overrides,
  };
}

export function makeNPC(overrides = {}) {
  return {
    x: 0, z: -11.5, vx: 0, vz: 0,
    cool: 0, reactT: 0, plan: null,
    tgt: { x: 0, z: -11.5 }, anim: null, netMode: false, backT: 0,
    ...overrides,
  };
}

export function makePlayer(overrides = {}) {
  return {
    x: 0, z: 12, vx: 0, vz: 0,
    anim: null, cool: 0, swingCd: 0, recover: 0,
    pending: null, charge: null, antSide: 0,
    ...overrides,
  };
}

export function makeScore() {
  return {
    pts: [0, 0], games: [0, 0], sets: [0, 0], setHist: [],
    tb: false, tbPts: [0, 0], tbStart: 0, done: false, winner: null,
  };
}

export function resetG(overrides = {}) {
  G.state = 'live';
  G.mode = 'match';
  G.diffKey = 'medium';
  G.matchType = 'singles';
  G.rally = 1;
  G.server = 0;
  G.serveOrderIdx = 0;
  G.serveOrder = [];
  G.score = makeScore();
  G.npcMem = { serve: { deuce: [], ad: [] }, lastServeRec: null, rallyX: 0 };
  G.ball = makeBall();
  G.npc = makeNPC();
  G.npc2 = null;
  G.player = makePlayer();
  G.partner = null;
  G.particles = [];
  G.bounceMarks = [];
  G.strike = null;
  G.cpuHitter = null;
  G.pointT = 0;
  G.next = null;
  G.serveT = Infinity;
  G.toss = null;
  G.paused = false;
  G.started = true;
  Object.assign(G, overrides);
}
