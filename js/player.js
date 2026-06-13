import { QUAL, PRESS_LEAD, HL, SW, CHARGE_FULL, CHARGE_MIN_POW, CHARGE_MAX_POW } from './constants.js';
import { G, keys } from './state.js';
import { clamp, lerp, gauss, rnd, bodyContactPenalty } from './utils.js';
import { showShot, fb } from './hud.js';
import { hitBall } from './ball.js';
import { serveBoxBounds } from './serve.js';
import { servingPlayer, serveSide } from './scoring.js';
import { logEvent } from './logger.js';

export function updatePlayer(dt) {
  const p = G.player;
  p.cool -= dt; p.swingCd -= dt; p.recover -= dt;
  if (p.anim) { p.anim.t += dt; if (!p.anim.charging && p.anim.t > 0.7) p.anim = null; }

  const shift = keys.ShiftLeft || keys.ShiftRight;
  const aimMode = shift && (G.state === 'serve' || G.state === 'toss') && servingPlayer() === 0;
  const ax = aimMode ? 0 : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const az = aimMode ? 0 : (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  const lockToss = G.state === 'toss' && servingPlayer() === 0;
  const canMove = !lockToss && (G.state === 'live' || G.state === 'serve' || G.state === 'toss' || G.state === 'point');
  let accel = 13, maxSp = 5.2, fric = 6.5;
  if (p.recover > 0) { accel *= 0.25; maxSp *= 0.55; }
  else if (p.anim && p.anim.charging) { accel *= 0.78; maxSp *= 0.86; }
  else if (p.anim) { accel *= 0.35; }
  if (az > 0) {
    p.backT = (p.backT || 0) + dt;
    const turned = p.backT > 0.6;
    accel *= turned ? 0.7 : 0.5; maxSp *= turned ? 0.8 : 0.55;
  } else p.backT = 0;
  if (canMove && (ax || az)) {
    const l = Math.hypot(ax, az);
    p.vx += ax / l * accel * dt; p.vz += az / l * accel * dt;
  } else {
    p.vx *= Math.max(0, 1 - fric * dt); p.vz *= Math.max(0, 1 - fric * dt);
  }
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > maxSp) { p.vx *= maxSp / sp; p.vz *= maxSp / sp; }
  if (canMove) {
    p.x = clamp(p.x + p.vx * dt, -7.5, 7.5);
    p.z = clamp(p.z + p.vz * dt, 0.75, 16.0);
    if (G.state === 'serve' && servingPlayer() === 0) {
      const ss = serveSide();
      p.x = clamp(p.x, ss === 'deuce' ? 0.0 : -SW, ss === 'deuce' ? SW : 0.0);
      p.z = clamp(p.z, HL, 14.5);
    }
  } else { p.vx = p.vz = 0; }
  p.spd = Math.hypot(p.vx, p.vz);
  p.stride = (p.stride || 0) + p.spd * dt * 3.1;

  if ((G.state === 'serve' || G.state === 'toss') && servingPlayer() === 0) {
    if (keys.ShiftLeft || keys.ShiftRight) {
      const sx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      const sz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
      const bb = serveBoxBounds();
      G.srvAim.x = clamp(G.srvAim.x + sx * 4.5 * dt, bb.x1, bb.x2);
      G.srvAim.z = clamp(G.srvAim.z + sz * 4.5 * dt, bb.z1, bb.z2);
    }
  }
  if (G.ball.held && servingPlayer() === 0 && (G.state === 'serve' || G.state === 'point')) {
    G.ball.x = p.x - 0.22; G.ball.z = p.z;
  }

  if (p.charge) {
    p.charge.t += dt;
    const st = G.strike, b = G.ball;
    const reachable = st ? Math.abs(st.x - p.x) <= 1.6 : Math.abs(b.x - p.x) <= 1.6;
    // ball reached the contact point (st.t floors near 0); only fall back to the
    // "passed the body" test when there is no prediction, so moving forward into an
    // incoming ball can't false-trigger a fresh charge.
    const atContact = st ? st.t <= 0.05 : (b.z > p.z + 0.2 && b.vz > 0);
    if (!keys[p.charge.key]) {
      strokeRelease();
    } else if (atContact && reachable) {
      strokeRelease(true);                 // held through the window in range → forced panic hit
    } else if (atContact && !reachable) {
      const key = p.charge.key;
      p.charge = null; p.anim = null; p.swingCd = 0.25;
      fb('Out of reach', '#e0a05a');
      logEvent('strokeRelease', { key, reject: 'reach', mode: 'autoCancel' });
    } else if (b.lastHitter !== 1 || !b.active || b.held) {
      p.charge = null; p.anim = null;
    }
  }

  if (p.pending) {
    p.pending.t -= dt;
    if (p.pending.t <= 0) p.pending = null;
    else {
      const b = G.ball;
      if (p.anim && b.active && !b.held)
        p.anim.contact = [clamp(b.x - p.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - p.z, -1.35, 1.35)];
      const thr = p.pending.panic ? 0.05 : p.anim && p.anim.type === 'volley' ? 0.06 : p.anim && p.anim.type === 'smash' ? 0.18 : 0.10;
      if (p.cool <= 0 && canPlayerHit() && p.anim && p.anim.t >= thr) doPlayerHit();
    }
  }
}

export function canPlayerHit() {
  const b = G.ball, p = G.player;
  if (!b.active || b.held || b.lastHitter !== 1 || b.isServe) return false;
  if (b.z < -0.35) return false;
  const d = Math.hypot(b.x - p.x, b.z - p.z);
  return d < 1.6 && b.y < 3.45;
}

export function strokePress(key) {
  const p = G.player, b = G.ball;
  if (G.state !== 'live') return;
  if (p.charge || p.pending || p.cool > 0 || p.swingCd > 0) return;
  if (b.lastHitter !== 1 || b.held) return;
  if (b.bounces === 0 && p.z < 8.5 && b.y <= 1.85) { instantHit(key); return; }
  const st = G.strike;
  p.charge = { key, t: 0 };
  p.anim = { t: 0, side: p.antSide || (st && st.x >= p.x ? 1 : -1), type: 'ground', charging: true };
  p.anim.contact = [clamp((st ? st.x : b.x) - p.x, -1.35, 1.35), clamp(st ? st.y : b.y, 0.25, 2.72), -0.35];
  fb('Hold…', '#b8c4d0');
  logEvent('strokeCharge', {
    key, strike: st ? { t: st.t, x: st.x, y: st.y } : null,
    dist: Math.hypot(b.x - p.x, b.z - p.z),
    contact: { x: b.x - p.x, y: b.y, z: b.z - p.z },
    chargeFull: CHARGE_FULL,
  });
}

function instantHit(key) {
  const p = G.player;
  const st = G.strike;
  if (!st) { logEvent('strokePress', { key, reject: 'notYet', mode: 'instant' }); fb('Not yet', '#b8c4d0'); return; }
  const err = st.t - PRESS_LEAD;
  if (err > 0.30) { logEvent('strokePress', { key, reject: 'tooEarly', err, mode: 'instant' }); fb('Too early', '#e0a05a'); return; }
  if (err < -0.13) { logEvent('strokePress', { key, reject: 'tooLate', err, mode: 'instant' }); fb('Too late', '#e05a5a'); return; }
  if (Math.abs(st.x - p.x) > 2.1) { logEvent('strokePress', { key, reject: 'outOfReach', err, mode: 'instant' }); fb('Out of reach', '#e0a05a'); return; }
  const a = Math.abs(err);
  let q = a <= 0.045 ? 'perfect' : a <= 0.12 ? 'good' : a <= 0.20 ? 'ok' : 'weak';
  if (err < -0.045) q = q === 'good' ? 'ok' : 'weak';
  p.pending = { key, q, charged: false, t: 0.42 };
  p.anim = { t: 0, side: p.antSide || (st.x >= p.x ? 1 : -1), type: st.y > 1.85 ? 'smash' : 'volley' };
  p.anim.contact = [clamp(st.x - p.x, -1.35, 1.35), clamp(st.y, 0.25, 2.72), -0.35];
  p.swingCd = 0.30;
  fb(QUAL[q].label, QUAL[q].col);
  logEvent('strokePress', { key, reject: null, q, err, mode: 'instant' });
}

function strokeRelease(panic) {
  const p = G.player, b = G.ball, ch = p.charge;
  if (!ch) return;
  const power = clamp(ch.t / CHARGE_FULL, 0, 1);
  p.charge = null;
  const st = G.strike;
  if (panic) {
    // Held the charge until the ball reached the strike zone — forced, badly-timed swing.
    p.pending = { key: ch.key, q: 'weak', charged: true, power: power * 0.4, panic: true, t: 0.42 };
    if (p.anim) { p.anim.charging = false; p.anim.t = 0; }
    else p.anim = { t: 0, side: p.antSide || (b.x >= p.x ? 1 : -1), type: 'ground' };
    p.anim.contact = [clamp(b.x - p.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), -0.35];
    p.swingCd = 0.30;
    fb('Panic!', '#e05a5a');
    logEvent('strokeRelease', {
      key: ch.key, q: 'weak', panic: true, power, holdT: ch.t,
      dist: Math.hypot(b.x - p.x, b.z - p.z),
      contact: { x: b.x - p.x, y: b.y, z: b.z - p.z },
    });
    return;
  }
  if (!st) { p.anim = null; p.swingCd = 0.20; fb('Not yet', '#b8c4d0'); logEvent('strokeRelease', { key: ch.key, reject: 'noStrike', power, holdT: ch.t, dist: Math.hypot(b.x - p.x, b.z - p.z) }); return; }
  const err = st.t - PRESS_LEAD, a = Math.abs(err);
  if (a > 0.32 || Math.abs(st.x - p.x) > 1.6) {
    p.anim = null; p.swingCd = 0.25;
    fb(a > 0.32 ? (err > 0 ? 'Too early' : 'Too late') : 'Out of reach', '#e05a5a');
    logEvent('strokeRelease', { key: ch.key, reject: a > 0.32 ? (err > 0 ? 'early' : 'late') : 'reach', err, power, holdT: ch.t, dist: Math.hypot(b.x - p.x, b.z - p.z) });
    return;
  }
  const ballBehind = b.z > p.z + 0.5 && b.vz > 0;
  const doubleBounceSoon = b.bounces >= 1 && b.y < 0.22 && b.vy < 0;
  if (ballBehind || doubleBounceSoon) {
    p.anim = null; p.swingCd = 0.25;
    fb('Too late', '#e05a5a');
    logEvent('strokeRelease', { key: ch.key, reject: 'ballGone', err, power, holdT: ch.t, dist: Math.hypot(b.x - p.x, b.z - p.z) });
    return;
  }
  let q = a <= 0.05 ? 'perfect' : a <= 0.12 ? 'good' : a <= 0.20 ? 'ok' : 'weak';
  if (err < -0.05) q = q === 'perfect' ? 'good' : q === 'good' ? 'ok' : 'weak';
  p.pending = { key: ch.key, q, charged: true, power, t: 0.42 };
  if (p.anim) { p.anim.charging = false; p.anim.t = 0; }
  else p.anim = { t: 0, side: p.antSide || (st.x >= p.x ? 1 : -1), type: 'ground' };
  p.anim.contact = [clamp(st.x - p.x, -1.35, 1.35), clamp(st.y, 0.25, 2.72), -0.35];
  p.swingCd = 0.30;
  fb(`${QUAL[q].label} · ${Math.round(power * 100)}%`, QUAL[q].col);
  logEvent('strokeRelease', {
    key: ch.key, q, err, power, holdT: ch.t,
    dist: Math.hypot(b.x - p.x, b.z - p.z),
    contact: { x: b.x - p.x, y: b.y, z: b.z - p.z },
    strike: { t: st.t, x: st.x, y: st.y },
  });
}

function doPlayerHit() {
  const b = G.ball, p = G.player, pend = p.pending;
  const d = Math.hypot(b.x - p.x, b.z - p.z);
  const contactX = b.x - p.x;
  const fore = contactX >= 0;
  const fh = fore ? 'Forehand' : 'Backhand';
  const bounced = b.bounces > 0;
  const Q = QUAL[pend.q];
  const aim  = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const depth = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);

  let spin = 0, speed, clear, tzBase, label, animType = 'ground', penalty = 1, shotTol = 1, shotType = 'flat';
  const atNet = p.z < 7.2;
  if (!bounced && b.y > 1.85) {
    animType = 'smash';
    if (pend.key === 'KeyJ')      { speed = 34;   clear = 0.22; tzBase = -8.6;  label = 'Overhead!';      shotType = 'smash'; }
    else if (pend.key === 'KeyK') { spin = -1; speed = 24; clear = 0.3; tzBase = -7.6; label = 'Slice Overhead'; shotType = 'slice'; }
    else                          { spin = -1; speed = 11; clear = 0.5; tzBase = -3.4; label = 'Touch Overhead'; shotType = 'soft'; }
  } else if (!bounced) {
    animType = 'volley';
    if (pend.key === 'KeyJ')      { speed = 17;   clear = 0.5;  tzBase = -6.8; label = `${fh} Punch Volley`;  shotType = 'flat'; }
    else if (pend.key === 'KeyK') { spin = -1; speed = 13; clear = 0.5; tzBase = -5.5; label = `${fh} Slice Volley`; shotType = 'slice'; }
    else                          { spin = -1; speed = 10.5; clear = 0.55; tzBase = -3.6; label = `${fh} Drop Volley`; shotType = 'soft'; }
    if (!atNet) penalty = 1.35;
  } else {
    if (pend.key === 'KeyJ')      { spin = 1;  speed = 23.5; clear = 0.78; tzBase = -9.7;  label = `${fh} Top Spin`;   shotTol = 0.7;  shotType = 'topspin'; }
    else if (pend.key === 'KeyK') { spin = -1; speed = 16.5; clear = 1.05; tzBase = -9.4;  label = `${fh} Slice`;      shotTol = 0.95; shotType = 'slice'; }
    else if (pend.key === 'KeyL') { spin = 0;  speed = 27;   clear = 0.42; tzBase = -10.0; label = `${fh} Flat Drive`; shotTol = 1.5;  shotType = 'flat'; }
    else if (pend.key === 'KeyI') { speed = 12.5; clear = 3.1; tzBase = -10.2; label = 'Lob';       shotTol = 1.0;  shotType = 'soft'; }
    else                          { spin = -1; speed = 9.5; clear = 0.35; tzBase = -3.3; label = 'Drop Shot'; shotTol = 1.15; shotType = 'soft'; if (p.z > 9.5) penalty = 1.45; }
  }
  if (p.anim) {
    p.anim.type = animType;
    p.anim.contact = [clamp(b.x - p.x, -1.35, 1.35), clamp(b.y, 0.25, 2.72), clamp(b.z - p.z, -1.35, 1.35)];
  }
  let tz = tzBase + (depth > 0 ? 1.4 : depth < 0 ? -2.3 : 0);
  let tx = aim * 2.9;
  const lunge = Math.min(1, d / 1.4);
  const bodyPen = bodyContactPenalty(contactX, fore, false);
  penalty *= bodyPen;
  const nf = Q.noise * penalty * shotTol;
  tx += gauss() * (0.30 + 1.0 * lunge * lunge) * nf;
  tz += gauss() * (0.55 + 1.2 * lunge * lunge) * nf;
  tz = clamp(tz, -13.5, -2.0);
  tx = clamp(tx, -5.8, 5.8);
  const txPreNoise = tx, tzPreNoise = tz;
  let shank = null;
  if (Math.random() < (Q.shank * penalty + 0.12 * lunge * lunge) * shotTol) {
    const roll = Math.random();
    if (roll < 0.4)        { tx = (tx >= 0 ? 1 : -1) * rnd(4.4, 5.6); shank = 'wide'; }
    else if (roll < 0.75)  { tz = rnd(-13.6, -12.2); shank = 'long'; }
    else                   { tz = rnd(-3.5, -2.0); clear = -0.35; shank = 'net'; }
  }
  const powerMult = pend.charged ? lerp(CHARGE_MIN_POW, CHARGE_MAX_POW, pend.power) : 1;
  speed *= Q.pow * powerMult * rnd(0.96, 1.04);
  clear *= Q.clr;
  if (b.y < 0.35 && animType === 'ground') { speed *= 0.86; clear += 0.25; }
  logEvent('playerShot', {
    key: pend.key, q: pend.q, label, animType, fore, aim, depth,
    charged: pend.charged, power: pend.charged ? pend.power : null, panic: pend.panic || false,
    powerMult, dist: d, contact: { x: contactX, y: b.y, z: b.z - p.z },
    lunge, penalty, shank,
    preNoise: { tx: txPreNoise, tz: tzPreNoise },
    final: { tx, tz }, speed, spin, clear,
  });
  hitBall(0, tx, tz, speed, spin, clear, shotType);
  p.vx = clamp(p.vx + (b.x - p.x) * 2.0, -3, 3); p.vz *= 0.4;
  p.recover = Q.rec + (penalty > 1.3 ? 0.12 : 0);
  p.cool = 0.5; p.pending = null;
  showShot(pend.charged ? `${label} · ${Math.round(pend.power * 100)}%` : label);
}
