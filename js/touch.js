// Touch controls — a peer of gamepad.js. Translates two floating thumb pads into
// the same `keys` map + startToss/strikeServe/strokePress calls the keyboard uses,
// so the engine (player.js charge/timing model) needs no changes.
//
// Left pad  : drag → movement keys (live) or absolute serve aim (serve/toss).
// Right pad : press-hold-release swing (live), or tap toss / tap strike (serve/toss).
//
// The pure geometry helpers (vecToMoveKeys, wedgeForVector, serveTypeForTap,
// clientToLogical) are exported and DOM-free so they unit-test without a browser.

import { G, keys } from './state.js';
import { W, H, TOUCH } from './constants.js';
import { startToss, strikeServe, serveBoxBounds } from './serve.js';
import { strokePress } from './player.js';
import { servingPlayer } from './scoring.js';
import { openMenu, closeMenu } from './match.js';
import { showShot } from './hud.js';
import { clamp } from './utils.js';

// ----------------------------------------------------------------------------
// Pure geometry (no DOM, no engine state) — unit-tested directly.
// ----------------------------------------------------------------------------

/** Map a client-space point through a canvas rect into logical W×H coordinates. */
export function clientToLogical(clientX, clientY, rect, w = W, h = H) {
  const x = rect.width ? (clientX - rect.left) * (w / rect.width) : 0;
  const y = rect.height ? (clientY - rect.top) * (h / rect.height) : 0;
  return { x, y };
}

/** 8-way joystick: drag vector → which of WASD are "held". Inside deadzone = none. */
export function vecToMoveKeys(dx, dy, dead = TOUCH.DEAD) {
  const out = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
  const mag = Math.hypot(dx, dy);
  if (mag < dead) return out;
  const t = mag * 0.38;            // a key engages once its axis dominates (≈ 8-way)
  out.KeyD = dx > t;               // screen +x = right
  out.KeyA = dx < -t;
  out.KeyS = dy > t;               // screen +y = down (toward camera)
  out.KeyW = dy < -t;              // up = away
  return out;
}

/** Swing flick vector → stroke key. Inside deadzone returns the default shot. */
export function wedgeForVector(dx, dy, dead = TOUCH.DEAD) {
  if (Math.hypot(dx, dy) < dead) return TOUCH.DEFAULT_KEY;
  const ang = (Math.atan2(-dy, dx) * 180) / Math.PI; // up = +90°
  let best = TOUCH.WEDGE[0], bestD = 999;
  for (const wgt of TOUCH.WEDGE) {
    const d = Math.abs(((ang - wgt.a + 540) % 360) - 180); // shortest angular distance 0..180
    if (d < bestD) { bestD = d; best = wgt; }
  }
  return best.key;
}

/** Serve strike type from the tap's vertical position (logical y). */
export function serveTypeForTap(y, h = H) {
  if (y < h * 0.45) return 'kick';
  if (y < h * 0.62) return 'slice';
  return 'flat';
}

// ----------------------------------------------------------------------------
// DOM wiring (guarded so importing this module under jsdom is a no-op).
// ----------------------------------------------------------------------------

const cv = (typeof document !== 'undefined') ? document.getElementById('cv') : null;

function isTouchEnv() {
  if (typeof window === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true;
  if (typeof window.matchMedia === 'function') {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch { /* ignore */ }
  }
  return 'ontouchstart' in window;
}

// Preference: 'auto' follows device + controller state; 'on'/'off' are explicit
// user choices (persisted), so an iPad user with a controller can hide the pads.
const PREF_KEY = 'ck_touchPref';
let pref = 'auto';
let gamepadActive = false;

function loadPref() {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === 'on' || v === 'off' || v === 'auto') pref = v;
  } catch { /* storage unavailable */ }
}

// What touch mode *should* be right now. Touch only ever turns on for a
// touch-capable device (or an explicit 'on'); a connected gamepad hides it in auto.
function resolve() {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return isTouchEnv() && !gamepadActive;
}

function updateToggleLabel() {
  const btn = (typeof document !== 'undefined') && document.getElementById('touchToggle');
  if (btn) btn.textContent = `Touch controls: ${G.touch.enabled ? 'On' : 'Off'}`;
}

function setEnabled(on) {
  if (G.touch.enabled === on) { updateToggleLabel(); return; }
  G.touch.enabled = on;
  if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('touch', on);
  updateToggleLabel();
  if (on) showShot('Touch controls on'); else clearAllKeys();
}

function clearAllKeys() {
  clearMoveKeys();
  if (G.touch.swing) { keys[G.touch.swing.key] = false; }
  G.touch.move = null; G.touch.swing = null; active.clear();
}

function apply() { setEnabled(resolve()); }

/** Explicitly set the touch preference ('on' | 'off' | 'auto') and persist it. */
export function setTouchPref(p) {
  pref = p;
  try { localStorage.setItem(PREF_KEY, p); } catch { /* ignore */ }
  apply();
}

// pointerId → { zone:'left'|'right' }
const active = new Map();

function logical(e) {
  const rect = cv.getBoundingClientRect();
  return clientToLogical(e.clientX, e.clientY, rect);
}

function clearMoveKeys() { keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = false; }

function onDown(e) {
  if (!G.touch.enabled || G.state === 'menu' || G.paused) return;
  const p = logical(e);
  if (p.y < H * TOUCH.TOP_GUARD) return;        // keep the top clear for HUD/menu
  e.preventDefault();
  const left = p.x < W * TOUCH.ZONE_SPLIT;
  G.touch.hintT = 6;                            // fade rest-hints once the user engages

  if (left) {
    active.set(e.pointerId, { zone: 'left' });
    G.touch.move = { ox: p.x, oy: p.y, x: p.x, y: p.y };
    if (isServeAimPhase()) applyServeAim(p);
    return;
  }

  // Right pad ----------------------------------------------------------------
  active.set(e.pointerId, { zone: 'right' });
  const human = servingPlayer() === 0;
  if (G.state === 'serve' && human) {
    startToss(0);
  } else if (G.state === 'toss' && G.toss && G.toss.by === 0) {
    strikeServe(serveTypeForTap(p.y));
  } else if (G.state === 'live') {
    const key = TOUCH.DEFAULT_KEY;
    keys[key] = true;                           // mirror so the charge can later release
    G.touch.swing = { ox: p.x, oy: p.y, x: p.x, y: p.y, key, latched: false };
    strokePress(key);                           // begins charge (or fires an instant volley)
  }
}

function onMove(e) {
  const a = active.get(e.pointerId);
  if (!a) return;
  e.preventDefault();
  const p = logical(e);

  if (a.zone === 'left') {
    if (!G.touch.move) return;
    G.touch.move.x = p.x; G.touch.move.y = p.y;
    if (isServeAimPhase()) { applyServeAim(p); return; }
    const mk = vecToMoveKeys(p.x - G.touch.move.ox, p.y - G.touch.move.oy);
    keys.KeyW = mk.KeyW; keys.KeyA = mk.KeyA; keys.KeyS = mk.KeyS; keys.KeyD = mk.KeyD;
    return;
  }

  // Right pad: latch the shot type the first time the drag clears the deadzone.
  const sw = G.touch.swing;
  if (!sw || sw.latched) { if (sw) { sw.x = p.x; sw.y = p.y; } return; }
  sw.x = p.x; sw.y = p.y;
  const dx = p.x - sw.ox, dy = p.y - sw.oy;
  if (Math.hypot(dx, dy) < TOUCH.DEAD) return;
  const key = wedgeForVector(dx, dy);
  if (key !== sw.key && G.player.charge) {       // re-bind the in-flight charge
    keys[sw.key] = false; keys[key] = true;
    G.player.charge.key = key;
  }
  sw.key = key; sw.latched = true;
}

function onUp(e) {
  const a = active.get(e.pointerId);
  if (!a) return;
  active.delete(e.pointerId);

  if (a.zone === 'left') {
    clearMoveKeys();
    G.touch.move = null;
    return;
  }
  const sw = G.touch.swing;
  if (sw) { keys[sw.key] = false; G.touch.swing = null; }  // lift → strokeRelease next tick
}

function isServeAimPhase() {
  return (G.state === 'serve' || G.state === 'toss') && servingPlayer() === 0;
}

// Absolute serve aim: thumb displacement inside the pad maps onto the service box.
function applyServeAim(p) {
  const m = G.touch.move; if (!m) return;
  const bb = serveBoxBounds();
  const nx = clamp((p.x - m.ox) / TOUCH.MOVE_R, -1, 1);
  const nz = clamp((p.y - m.oy) / TOUCH.MOVE_R, -1, 1);
  G.srvAim.x = (bb.x1 + bb.x2) / 2 + nx * (bb.x2 - bb.x1) / 2;
  G.srvAim.z = (bb.z1 + bb.z2) / 2 + nz * (bb.z2 - bb.z1) / 2;
}

/** Force touch mode on (used by the e2e harness and as a debug hook). */
export function enableTouch() { setTouchPref('on'); }

if (cv) {
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  if (typeof window !== 'undefined') { window.enableTouch = enableTouch; window.setTouchPref = setTouchPref; }

  // Mark touch-capable devices so the menu can offer the on/off toggle even when
  // touch is currently disabled (e.g. a controller is connected).
  if (isTouchEnv() && document.body) document.body.classList.add('touch-capable');

  // A connected gamepad auto-hides the pads in 'auto' mode; reconnect logic in
  // gamepad.js still drives play. Explicit 'on'/'off' overrides this.
  window.addEventListener('gamepadconnected', () => { gamepadActive = true; apply(); });
  window.addEventListener('gamepaddisconnected', () => { gamepadActive = false; apply(); });

  const toggleBtn = document.getElementById('touchToggle');
  if (toggleBtn) toggleBtn.addEventListener('click', () => setTouchPref(G.touch.enabled ? 'off' : 'on'));

  const pauseBtn = document.getElementById('touchPause');
  if (pauseBtn) pauseBtn.addEventListener('click', () => {
    if (!G.started) return;
    G.paused ? closeMenu() : openMenu();
  });

  loadPref();
  apply();
}
