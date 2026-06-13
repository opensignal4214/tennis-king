import { GRAV, DIFF, QUAL, SRV_SPEED, SERVE_TYPE, TOSS_APEX } from './constants.js';
import { G } from './state.js';
import { clamp, rnd, gauss, tossY } from './utils.js';
import { tone, sHit, sFault } from './audio.js';
import { solveShot, predictLanding } from './physics.js';
import { hintEl, showMsg, showShot, fb, refreshHUD } from './hud.js';
import { servingPlayer, serveSide } from './scoring.js';
import { endPoint, showGameOver } from './match.js';
import { logPointStart, logEvent } from './logger.js';

export function serveBoxBounds() {
  const side = serveSide();
  return side === 'deuce'
    ? { x1: -3.85, x2: -0.25, z1: -6.0, z2: -1.0 }
    : { x1:  0.25, x2:  3.85, z1: -6.0, z2: -1.0 };
}

export function setupServe() {
  if (G.score && G.score.done) { showGameOver(); return; }
  const sv = servingPlayer(), side = serveSide();
  const b = G.ball, P = G.player, N = G.npc;
  N.netMode = false;
  let npcReceiveX = null;
  if (sv === 0) {
    P.x = side === 'deuce' ? 1.2 : -1.2; P.z = 12.45;
    const sgn = side === 'deuce' ? -1 : 1;
    const own = G.npcMem.serve[side], opp = G.npcMem.serve[side === 'deuce' ? 'ad' : 'deuce'];
    const recs = [];
    own.slice(-5).forEach(r => recs.push({ w: r.projX * sgn, k: r.w }));
    opp.slice(-5).forEach(r => recs.push({ w: r.projX * -sgn, k: r.w * 0.5 }));
    let rx = sgn * 2.4;
    if (recs.length >= 2) {
      let sw = 0, sx = 0; recs.forEach(r => { sw += r.k; sx += r.w * r.k; });
      const wide = clamp(sx / sw, 0.4, 4.0);
      const adapt = { easy: 0.35, medium: 0.55, hard: 0.75 }[G.diffKey];
      rx = sgn * (2.4 * (1 - adapt) + wide * adapt);
    }
    N.x = clamp(rx, -4.2, 4.2); N.z = -12.6 - DIFF[G.diffKey].retDepth; N.tgt = { x: N.x, z: N.z };
    npcReceiveX = N.x;
    const bb = serveBoxBounds();
    G.srvAim = { x: clamp(G.srvAim.x, bb.x1, bb.x2), z: clamp(G.srvAim.z, bb.z1, bb.z2) };
    if (G.srvAim.x < bb.x1 || G.srvAim.x > bb.x2) G.srvAim.x = (bb.x1 + bb.x2) / 2;
  } else {
    N.x = side === 'deuce' ? -1.2 : 1.2; N.z = -12.45; N.tgt = { x: N.x, z: N.z };
    P.x = side === 'deuce' ? 2.0 : -2.0; P.z = 12.6;
  }
  P.vx = P.vz = 0; P.pending = null; P.recover = 0; P.antSide = 0; N.antSide = 0;
  b.active = false; b.held = true; b.trail.length = 0;
  const dom = sv === 0 ? 1 : -1;
  b.x = (sv === 0 ? P.x : N.x) - dom * 0.22; b.y = 1.3; b.z = sv === 0 ? P.z : N.z;
  b.vx = b.vy = b.vz = 0; b.spin = 0; b.netHit = false; b.isServe = false; b.bounces = 0;
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
  const tol = (SERVE_TYPE[type || 'flat'].tol) || 1; // flat = tighter window, kick = more forgiving
  const err = Math.abs(t.t - TOSS_APEX);
  const q = err <= 0.045 * tol ? 'perfect' : err <= 0.10 * tol ? 'good' : err <= 0.18 * tol ? 'ok' : 'weak';
  fb(QUAL[q].label, QUAL[q].col);
  fireServe(t.by, q, tossY(t.t), type);
}

export function fireServe(sv, q, contactY, type) {
  const b = G.ball, d = DIFF[G.diffKey];
  G.toss = null;
  if (sv === 1 && !type) {
    type = G.serveNum === 2 ? (Math.random() < 0.7 ? 'kick' : 'slice')
         : (Math.random() < 0.6 ? 'flat' : Math.random() < 0.6 ? 'slice' : 'kick');
  }
  const ST = SERVE_TYPE[type || 'flat'];
  const safety = ST.spin !== 0 ? 0.75 : 1;
  // Timing-based serve fault (player only): a mistimed flat serve is genuinely risky.
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
    const bx = side === 'deuce' ? [0.3, 3.85] : [-3.85, -0.3];
    if (Math.random() < d.open * 0.6) {
      tx = Math.random() < 0.5 ? (bx[0] < 0 ? bx[0] + 0.35 : bx[1] - 0.35) : (bx[0] < 0 ? bx[1] - 0.35 : bx[0] + 0.35);
    } else tx = rnd(bx[0] + 0.6, bx[1] - 0.6);
    tz = rnd(3.6, 5.7);
  }
  const curve = ST.curve * (sv === 0 ? -1 : 1);
  let ax = tx + gauss() * sx, az = tz + gauss() * 0.5 * (sv === 0 ? QUAL[q].noise * 0.8 * safety : 1);
  b.held = false; b.active = true;
  b.x = (sv === 0 ? G.player.x : G.npc.x) + (sv === 0 ? 0.25 : -0.25);
  b.y = contactY || 2.9; b.z = sv === 0 ? G.player.z : G.npc.z;
  if (curve) {
    const Test = Math.hypot(ax - b.x, az - b.z) / speed;
    ax -= 0.5 * curve * Test * Test;
  }
  if (serveFault) {
    if (Math.random() < 0.5) ax = (serveSide() === 'deuce' ? -5.0 : 5.0); // wide of the sideline
    else az = -7.6;                                                         // long, past service line (SVC = 6.4)
  }
  const g = GRAV * (1 + 0.22 * ST.spin);
  const v = solveShot(b.x, b.y, b.z, ax, az, speed, g, Math.max(ST.clr, G.serveNum === 2 ? 0.12 : 0));
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.spin = ST.spin; b.curve = curve;
  b.lastHitter = sv; b.bounces = 0; b.isServe = true; b.netHit = false;
  G.state = 'live';
  G.rally = 1;
  if (sv === 0) { G.npc.reactT = d.react * 0.5; G.npc.plan = null; G.player.recover = 0.45; showShot(ST.label); }
  else G.npc.recover = 0.45;
  logEvent('serve', {
    server: sv, serveNum: G.serveNum, q, type: type || 'flat',
    speed, target: { tx, tz }, aim: { ax, az }, curve, contactY: b.y,
    predicted: predictLanding(),
  });
  sHit(speed); refreshHUD();
  const ent = sv === 0 ? G.player : G.npc;
  ent.anim = { t: 0.18, side: sv === 0 ? 1 : -1, type: 'serve' };
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
    endPoint(1 - sv, 'Double Fault');
  }
}

export function wait(t, fn) {
  G.state = 'point'; G.pointT = t; G.next = fn;
}

export function updateToss(dt) {
  if (G.state !== 'toss' || !G.toss) return;
  const t = G.toss; t.t += dt;
  const sv = t.by, dom = sv === 0 ? 1 : -1, phT = Math.min(1, t.t / 0.5);
  G.ball.held = true; G.ball.active = false;
  G.ball.x = (sv === 0 ? G.player.x : G.npc.x) - dom * 0.22 + dom * 0.4 * phT;
  G.ball.z = (sv === 0 ? G.player.z : G.npc.z) + (sv === 0 ? -0.3 : 0.3) * phT;
  G.ball.y = Math.max(1.0, tossY(t.t));
  if (!t.hit && t.t > 1.15) {
    G.toss = null; G.state = 'serve';
    hintEl.style.display = 'block';
    if (sv === 0) hintEl.innerHTML = 'Toss again — <b>SPACE</b>';
    else G.serveT = 0.4;
  }
}

