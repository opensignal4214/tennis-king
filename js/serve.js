import { GRAV, DIFF, QUAL, SRV_SPEED, SERVE_TYPE, TOSS_APEX } from './constants.js';
import { G } from './state.js';
import { clamp, rnd, gauss, tossY } from './utils.js';
import { tone, sHit, sFault } from './audio.js';
import { solveShot, predictLanding } from './physics.js';
import { hintEl, showMsg, showShot, fb, refreshHUD } from './hud.js';
import { servingPlayer, serveSide } from './scoring.js';
import { endPoint, showGameOver } from './match.js';
import { logPointStart, logEvent } from './logger.js';

// Returns the entity object for the given server index.
// Doubles: 0=player,1=partner,2=npc,3=npc2. Singles: 0=player,1=npc.
function serverEntity(sv) {
  if (G.matchType !== 'doubles') return sv === 0 ? G.player : G.npc;
  return sv === 0 ? G.player : sv === 1 ? G.partner : sv === 2 ? G.npc : G.npc2;
}

export function serveBoxBounds() {
  const side = serveSide();
  return side === 'deuce'
    ? { x1: -3.85, x2: -0.25, z1: -6.0, z2: -1.0 }
    : { x1:  0.25, x2:  3.85, z1: -6.0, z2: -1.0 };
}

export function setupServe() {
  if (G.score && G.score.done) { showGameOver(); return; }
  const sv = servingPlayer(), side = serveSide();

  if (G.matchType === 'doubles') { setupServeDoubles(sv, side); return; }

  // ---- Singles (original logic) ----
  const b = G.ball, P = G.player, N = G.npc;
  N.netMode = false;
  let npcReceiveX = null;
  if (sv === 0) {
    P.x = side === 'deuce' ? 1.2 : -1.2; P.z = 12.3;
    const sgn = side === 'deuce' ? -1 : 1;
    const own = G.npcMem.serve[side], opp = G.npcMem.serve[side === 'deuce' ? 'ad' : 'deuce'];
    const recs = [];
    own.slice(-5).forEach(r => recs.push({ w: r.projX * sgn, k: r.w }));
    opp.slice(-5).forEach(r => recs.push({ w: r.projX * -sgn, k: r.w * 0.5 }));
    let rx = sgn * 2.9;
    if (recs.length >= 2) {
      let sw = 0, sx = 0; recs.forEach(r => { sw += r.k; sx += r.w * r.k; });
      const wide = clamp(sx / sw, 0.4, 4.0);
      const adapt = { easy: 0.35, medium: 0.55, hard: 0.75 }[G.diffKey];
      rx = sgn * (2.9 * (1 - adapt) + wide * adapt);
    }
    N.x = clamp(rx, -4.2, 4.2); N.z = -12.6 - DIFF[G.diffKey].retDepth; N.tgt = { x: N.x, z: N.z };
    npcReceiveX = N.x;
    const bb = serveBoxBounds();
    G.srvAim = { x: clamp(G.srvAim.x, bb.x1, bb.x2), z: clamp(G.srvAim.z, bb.z1, bb.z2) };
    if (G.srvAim.x < bb.x1 || G.srvAim.x > bb.x2) G.srvAim.x = (bb.x1 + bb.x2) / 2;
  } else {
    N.x = side === 'deuce' ? -1.2 : 1.2; N.z = -12.45; N.tgt = { x: N.x, z: N.z };
    // Receiver starts wider — closer to their corner to cover the serve.
    P.x = side === 'deuce' ? 2.9 : -2.9; P.z = 12.6;
  }
  P.vx = P.vz = 0; P.pending = null; P.recover = 0; P.antSide = 0; N.antSide = 0;
  b.active = false; b.held = true; b.trail.length = 0;
  const dom = sv === 0 ? 1 : -1;
  b.x = (sv === 0 ? P.x : N.x) - dom * 0.22; b.y = 1.3; b.z = sv === 0 ? P.z : N.z;
  b.vx = b.vy = b.vz = 0; b.spin = 0; b.netHit = false; b.isServe = false; b.bounces = 0;
  b.squashT = 0; b.hitFlash = null;
  G.rally = 0; G.strike = null;
  G.state = 'serve';
  G.serveT = sv === 1 ? rnd(1.0, 1.8) : Infinity;
  logPointStart({ server: sv, serveSide: side, npcReceiveX });
  hintEl.style.display = 'block';
  if (sv === 0) {
    hintEl.innerHTML = (G.mode === 'rally' ? '' : `${G.serveNum === 1 ? '1st' : '2nd'} serve · ${side} court — `)
      + '<b>WASD</b> move · <b>Shift+WASD</b> aim · <b>SPACE</b> toss · strike: <b>J</b> top spin · <b>K</b> slice · <b>L</b> flat';
  } else {
    hintEl.innerHTML = 'CPU to serve — get ready';
  }
  refreshHUD();
}

function setupServeDoubles(sv, side) {
  const b = G.ball;
  const entities = [G.player, G.partner, G.npc, G.npc2];
  const svEnt = entities[sv];
  const svTeam = sv < 2 ? 0 : 1;

  const isDeuce = side === 'deuce';
  const humanDeuce = G.receiveHuman === 0 ? 0 : 1;  // human entity covering the deuce court
  const humanAd    = humanDeuce === 0 ? 1 : 0;
  const cpuDeuce   = G.receiveCpu  === 0 ? 2 : 3;    // cpu entity covering the deuce court
  const cpuAd      = cpuDeuce === 2 ? 3 : 2;
  const recvIdx = svTeam === 0 ? (isDeuce ? cpuDeuce : cpuAd)
                               : (isDeuce ? humanDeuce : humanAd);
  G.receiverEntity = recvIdx;
  const recvEnt = entities[recvIdx];

  // Determine partner indices (teammate of server/receiver)
  const svPartnerIdx = sv < 2 ? (sv === 0 ? 1 : 0) : (sv === 2 ? 3 : 2);
  const recvPartnerIdx = recvIdx < 2 ? (recvIdx === 0 ? 1 : 0) : (recvIdx === 2 ? 3 : 2);
  const svPartnerEnt = entities[svPartnerIdx];
  const recvPartnerEnt = entities[recvPartnerIdx];
  const d = DIFF[G.diffKey];

  // Server lateral: deuce = +x for human team, deuce = -x for cpu team (mirrored courts)
  const svSideX = svTeam === 0
    ? (isDeuce ? 1.2 : -1.2)
    : (isDeuce ? -1.2 : 1.2);
  const svBaseZ  = svTeam === 0 ? 12.3 : -12.45;

  // Receiver position — adaptive for NPC (reuse serve memory from human team)
  let recvX;
  if (svTeam === 0) {
    const sgn = isDeuce ? -1 : 1;
    const own = G.npcMem.serve[side], opp = G.npcMem.serve[side === 'deuce' ? 'ad' : 'deuce'];
    const recs = [];
    own.slice(-5).forEach(r => recs.push({ w: r.projX * sgn, k: r.w }));
    opp.slice(-5).forEach(r => recs.push({ w: r.projX * -sgn, k: r.w * 0.5 }));
    recvX = sgn * 2.9;
    if (recs.length >= 2) {
      let sw = 0, sx = 0; recs.forEach(r => { sw += r.k; sx += r.w * r.k; });
      const wide = clamp(sx / sw, 0.4, 4.0);
      const adapt = { easy: 0.35, medium: 0.55, hard: 0.75 }[G.diffKey];
      recvX = sgn * (2.9 * (1 - adapt) + wide * adapt);
    }
    recvX = clamp(recvX, -4.2, 4.2);
    const bb = serveBoxBounds();
    G.srvAim = { x: clamp(G.srvAim.x, bb.x1, bb.x2), z: clamp(G.srvAim.z, bb.z1, bb.z2) };
    if (G.srvAim.x < bb.x1 || G.srvAim.x > bb.x2) G.srvAim.x = (bb.x1 + bb.x2) / 2;
  } else {
    // CPU serves: human receiver goes wide to their deuce/ad corner
    recvX = isDeuce ? 2.9 : -2.9;
  }
  const recvBaseZ = svTeam === 0 ? -12.6 - d.retDepth : 12.6;

  // Net positions: server's partner and receiver's partner go to net (opposite side from baseline partner)
  const svNetX    =  -svSideX * 1.2;
  // Server's partner crowds the net while their partner serves.
  const svNetZ    = svTeam === 0 ? 1.8 : -1.8;
  // Receiver's partner hangs back near the service line, tucked toward the centre line.
  const recvNetX  = -recvX * 0.45; // net player diagonal from receiver, nearer the middle
  const recvNetZ  = svTeam === 0 ? -5.5 : 5.5;

  // Place server
  svEnt.x = svSideX; svEnt.z = svBaseZ;
  svEnt.vx = svEnt.vz = 0; svEnt.recover = 0;
  if (svEnt.pending !== undefined) svEnt.pending = null;

  // Place server's partner at net
  svPartnerEnt.x = svNetX; svPartnerEnt.z = svNetZ;
  svPartnerEnt.vx = svPartnerEnt.vz = 0;
  svPartnerEnt.netMode = true; svPartnerEnt.netX = svNetX;
  if (svPartnerEnt.tgt) { svPartnerEnt.tgt.x = svNetX; svPartnerEnt.tgt.z = svNetZ; }

  // Place receiver
  recvEnt.x = recvX; recvEnt.z = recvBaseZ;
  recvEnt.vx = recvEnt.vz = 0; recvEnt.netMode = false;
  if (recvEnt.tgt) { recvEnt.tgt.x = recvX; recvEnt.tgt.z = recvBaseZ; }
  if (recvEnt.pending !== undefined) recvEnt.pending = null;

  // Place receiver's partner at net
  recvPartnerEnt.x = recvNetX; recvPartnerEnt.z = recvNetZ;
  recvPartnerEnt.vx = recvPartnerEnt.vz = 0;
  recvPartnerEnt.netMode = true; recvPartnerEnt.netX = recvNetX;
  if (recvPartnerEnt.tgt) { recvPartnerEnt.tgt.x = recvNetX; recvPartnerEnt.tgt.z = recvNetZ; }

  // Reset anticipation for all; assign each entity a home court half from starting position
  entities.forEach(e => { if (e) { e.antSide = 0; e.homeSide = e.x >= 0 ? 1 : -1; } });
  if (G.npc) { G.npc.plan = null; }
  if (G.npc2) { G.npc2.plan = null; }
  G.cpuHitter = null;

  // Ball
  b.active = false; b.held = true; b.trail.length = 0;
  const dom = svTeam === 0 ? 1 : -1;
  b.x = svEnt.x - dom * 0.22; b.y = 1.3; b.z = svEnt.z;
  b.vx = b.vy = b.vz = 0; b.spin = 0; b.netHit = false; b.isServe = false; b.bounces = 0;
  b.squashT = 0; b.hitFlash = null;
  G.rally = 0; G.strike = null;
  G.state = 'serve';

  // Auto-serve timer: human player (sv=0) uses spacebar; all others auto-serve
  G.serveT = sv === 0 ? Infinity : rnd(1.0, 1.8);

  logPointStart({ server: sv, serveSide: side, npcReceiveX: recvEnt.x });
  hintEl.style.display = 'block';
  if (sv === 0) {
    hintEl.innerHTML = (G.mode === 'rally' ? '' : `${G.serveNum === 1 ? '1st' : '2nd'} serve · ${side} court — `)
      + '<b>WASD</b> move · <b>Shift+WASD</b> aim · <b>SPACE</b> toss · strike: <b>J</b> top spin · <b>K</b> slice · <b>L</b> flat';
  } else if (svTeam === 0) {
    hintEl.innerHTML = 'Your partner is serving — get ready';
  } else {
    hintEl.innerHTML = 'CPU to serve — get ready';
  }
  refreshHUD();
}

export function startToss(by) {
  if (G.state !== 'serve') return;
  G.state = 'toss'; G.toss = { t: 0, by, hit: false };
  hintEl.style.display = 'none';
  tone(420, 0.05, 'sine', 0.025);
}

export function strikeServe(type) {
  const t = G.toss;
  if (!t || t.hit) return;
  if (t.t < 0.20) { fb('Wait for the toss', '#e0a05a'); return; }
  t.hit = true;
  const tol = (SERVE_TYPE[type || 'flat'].tol) || 1;
  const err = Math.abs(t.t - TOSS_APEX);
  const q = err <= 0.045 * tol ? 'perfect' : err <= 0.10 * tol ? 'good' : err <= 0.18 * tol ? 'ok' : 'weak';
  fb(QUAL[q].label, QUAL[q].col);
  fireServe(t.by, q, tossY(t.t), type);
}

export function fireServe(sv, q, contactY, type) {
  const b = G.ball, d = DIFF[G.diffKey];
  G.toss = null;
  // All non-human serves (partner, npc, npc2) pick type automatically
  if (sv !== 0 && !type) {
    type = G.serveNum === 2 ? (Math.random() < 0.7 ? 'kick' : 'slice')
         : (Math.random() < 0.6 ? 'flat' : Math.random() < 0.6 ? 'slice' : 'kick');
  }
  const ST = SERVE_TYPE[type || 'flat'];
  const safety = ST.spin !== 0 ? 0.75 : 1;
  const svTeam = G.matchType === 'doubles' ? (sv < 2 ? 0 : 1) : sv;
  const svEnt = serverEntity(sv);
  const serveFault = sv === 0 && ST.fault && Math.random() < (ST.fault[q] || 0);
  let speed, sx, tx, tz;
  if (sv === 0) {
    speed = SRV_SPEED[q] * (G.serveNum === 2 ? 0.88 : 1) * ST.m;
    sx = QUAL[q].noise * 0.42 * (G.serveNum === 2 ? 0.7 : 1) * safety;
    tx = G.srvAim.x; tz = G.srvAim.z;
  } else {
    speed = d.srv * (G.serveNum === 1 ? 1 : 0.8) * rnd(0.95, 1.03) * ST.m;
    sx = d.srvNoise * (G.serveNum === 1 ? 1 : 0.6) * safety;
    const side = serveSide();
    // svTeam===0 (partner) serves from human side to CPU court (z<0), mirrored x-ranges
    // svTeam===1 (npc/npc2) serves from CPU side to human court (z>0), standard x-ranges
    const bx = svTeam === 0
      ? (side === 'deuce' ? [-3.85, -0.3] : [0.3, 3.85])
      : (side === 'deuce' ? [0.3, 3.85]   : [-3.85, -0.3]);
    if (Math.random() < d.open * 0.6) {
      tx = Math.random() < 0.5 ? (bx[0] < 0 ? bx[0] + 0.35 : bx[1] - 0.35) : (bx[0] < 0 ? bx[1] - 0.35 : bx[0] + 0.35);
    } else tx = rnd(bx[0] + 0.6, bx[1] - 0.6);
    tz = svTeam === 0 ? -rnd(3.6, 5.7) : rnd(3.6, 5.7);
  }
  const curve = ST.curve * (svTeam === 0 ? -1 : 1);
  let ax = tx + gauss() * sx, az = tz + gauss() * 0.5 * (sv === 0 ? QUAL[q].noise * 0.8 * safety : 1);
  b.held = false; b.active = true;
  b.x = svEnt.x + (svTeam === 0 ? 0.25 : -0.25);
  b.y = contactY || 2.9; b.z = svEnt.z;
  if (curve) {
    const Test = Math.hypot(ax - b.x, az - b.z) / speed;
    ax -= 0.5 * curve * Test * Test;
  }
  if (serveFault) {
    if (Math.random() < 0.5) ax = (serveSide() === 'deuce' ? -5.0 : 5.0);
    else az = -7.6;
  }
  const g = GRAV * (1 + 0.22 * ST.spin);
  const v = solveShot(b.x, b.y, b.z, ax, az, speed, g, Math.max(ST.clr, G.serveNum === 2 ? 0.12 : 0));
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.spin = ST.spin; b.curve = curve;
  b.lastHitter = svTeam; // team index (0=human-team, 1=cpu-team)
  G.lastHitterEntity = sv;
  b.bounces = 0; b.isServe = true; b.netHit = false;
  G.state = 'live';
  G.rally = 1;
  if (svTeam === 0) {
    G.npc.reactT = d.react * 0.5; G.npc.plan = null;
    if (G.npc2) { G.npc2.reactT = d.react * 0.5; G.npc2.plan = null; }
    svEnt.recover = 0.45;
    showShot(ST.label);
  } else {
    svEnt.recover = 0.45;
    if (G.player) G.player.recover = 0;
    if (G.partner) G.partner.recover = 0;
  }
  logEvent('serve', {
    server: sv, serveNum: G.serveNum, q, type: type || 'flat',
    speed, target: { tx, tz }, aim: { ax, az }, curve, contactY: b.y,
    predicted: predictLanding(),
  });
  const serveSoundType = type === 'kick' ? 'topspin' : (type === 'slice' ? 'slice' : 'flat');
  sHit(serveSoundType, speed, { isServe: true }); refreshHUD();
  svEnt.anim = { t: 0.18, side: svTeam === 0 ? 1 : -1, type: 'serve' };
}

export function fault() {
  sFault();
  const sv = servingPlayer();
  logEvent('fault', { serveNum: G.serveNum, double: G.mode === 'match' && G.serveNum === 2 });
  if (G.mode === 'rally') {
    showMsg('Fault', 'take it again', 1.1);
    wait(1.1, setupServe);
    return;
  }
  if (G.serveNum === 1) {
    G.serveNum = 2;
    showMsg('Fault', 'second serve', 1.2);
    wait(1.4, setupServe);
  } else {
    G.serveNum = 1;
    const svTeam = G.matchType === 'doubles' ? (sv < 2 ? 0 : 1) : sv;
    const winTeam = 1 - svTeam; // opposite team wins on double fault
    endPoint(winTeam, 'Double Fault');
  }
}

export function wait(t, fn) {
  G.state = 'point'; G.pointT = t; G.next = fn;
}

export function updateToss(dt) {
  if (G.state !== 'toss' || !G.toss) return;
  const t = G.toss; t.t += dt;
  const sv = t.by;
  const svEnt = serverEntity(sv);
  const svTeam = G.matchType === 'doubles' ? (sv < 2 ? 0 : 1) : sv;
  const dom = svTeam === 0 ? 1 : -1;
  const phT = Math.min(1, t.t / 0.5);
  G.ball.held = true; G.ball.active = false;
  G.ball.x = svEnt.x - dom * 0.22 + dom * 0.4 * phT;
  G.ball.z = svEnt.z + (svTeam === 0 ? -0.3 : 0.3) * phT;
  G.ball.y = Math.max(1.0, tossY(t.t));
  if (!t.hit && t.t > 1.15) {
    G.toss = null; G.state = 'serve';
    hintEl.style.display = 'block';
    if (sv === 0) hintEl.innerHTML = 'Toss again — <b>SPACE</b>';
    else G.serveT = 0.4;
  }
}
