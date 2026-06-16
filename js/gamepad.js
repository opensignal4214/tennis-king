import { G, keys } from './state.js';
import { startToss, strikeServe, serveBoxBounds } from './serve.js';
import { strokePress } from './player.js';
import { servingPlayer } from './scoring.js';
import { openMenu, closeMenu } from './match.js';
import { toggleStats } from './menu.js';
import { showShot } from './hud.js';
import { clamp } from './utils.js';

const DEAD = 0.2;
const AIM_SPD = 4.5; // match player.js serve-aim speed (4.5 units/sec)

let gpIndex = null;
let prev = [];

// ---- menu/overlay navigation (D-pad/stick to move, ✕ confirm, ○ back) ----
let gpContainer = null, gpEls = [], gpIdx = 0, gpNavCd = 0;

const menuVisible = el => el && getComputedStyle(el).display !== 'none';

// The topmost open menu/overlay the controller should drive, in priority order.
function activeMenu() {
  const v = id => menuVisible(document.getElementById(id)) ? document.getElementById(id) : null;
  return v('statsscreen') || v('cointoss') || v('colorpick') || v('matchtype') || v('menu');
}

function focusables(container) {
  return [...container.querySelectorAll('button')].filter(el => !el.disabled && el.offsetParent !== null);
}

function clearGpFocus() {
  if (gpContainer) gpContainer.querySelectorAll('.gp-focus').forEach(e => e.classList.remove('gp-focus'));
  gpContainer = null; gpEls = []; gpIdx = 0;
}

function backAction(container) {
  if (container.id === 'statsscreen') { document.getElementById('statsBack')?.click(); return; }
  if (container.id === 'menu' && G.started) closeMenu();
}

function navigateMenu(container, hit, ax, dt) {
  const els = focusables(container);
  if (container !== gpContainer || els.length !== gpEls.length) {
    clearGpFocus();
    gpContainer = container; gpEls = els; gpIdx = 0;
  } else {
    gpEls = els;
  }
  if (!gpEls.length) return;

  let step = 0;
  if (hit(13) || hit(15)) step = 1;            // D-pad down / right → next
  else if (hit(12) || hit(14)) step = -1;      // D-pad up / left → prev
  gpNavCd -= dt;
  const ly = Math.abs(ax[1]) > 0.5 ? ax[1] : 0;
  const lx = Math.abs(ax[0]) > 0.5 ? ax[0] : 0;
  if (!step && (ly || lx) && gpNavCd <= 0) { step = (ly || lx) > 0 ? 1 : -1; gpNavCd = 0.18; }

  if (step) {
    gpIdx = (gpIdx + step + gpEls.length) % gpEls.length;
    gpEls[gpIdx].scrollIntoView({ block: 'nearest' });
  }
  gpEls.forEach((e, i) => e.classList.toggle('gp-focus', i === gpIdx));

  if (hit(0)) gpEls[gpIdx].click();            // ✕ confirm
  if (hit(1)) backAction(container);           // ○ back
}

const statusEl   = document.getElementById('gamepadStatus');
const controlsEl = document.getElementById('controlsCard');

window.addEventListener('gamepadconnected', e => {
  gpIndex = e.gamepad.index;
  if (statusEl)   { statusEl.textContent = '🎮 Controller'; statusEl.classList.add('active'); }
  if (controlsEl) controlsEl.classList.add('has-gp');
  showShot('Controller connected');
});

window.addEventListener('gamepaddisconnected', e => {
  if (e.gamepad.index !== gpIndex) return;
  gpIndex = null;
  prev = [];
  clearGpFocus();
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'Semicolon']) keys[k] = false;
  if (statusEl)   statusEl.classList.remove('active');
  if (controlsEl) controlsEl.classList.remove('has-gp');
  showShot('Controller disconnected');
});

export function updateGamepad(dt) {
  if (gpIndex === null) return;
  const gp = navigator.getGamepads()[gpIndex];
  if (!gp) return;

  const b = gp.buttons;
  const ax = gp.axes;
  const hit = i => b[i]?.pressed && !prev[i]; // rising edge

  // Global toggles — work in menus and in play.
  if (hit(9) && G.started) { G.paused ? closeMenu() : openMenu(); }   // Options → pause
  if (hit(8)) { G.mute = !G.mute; showShot(G.mute ? 'Sound off' : 'Sound on'); } // Create → mute
  if (hit(4)) { G.showLandings = !G.showLandings; showShot(G.showLandings ? 'Shot map on' : 'Shot map off'); } // L1
  if (hit(6) && G.started) toggleStats();                            // L2 → stats screen

  // When a menu/overlay is open, drive it instead of the game.
  const menu = activeMenu();
  if (menu) {
    navigateMenu(menu, hit, ax, dt);
    keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = false;           // no drift behind a menu
    prev = b.map(btn => btn?.pressed ?? false);
    return;
  }
  clearGpFocus();

  // Movement: left stick + D-pad → keys map (read each frame by player.js)
  const lx = Math.abs(ax[0]) > DEAD ? ax[0] : 0;
  const ly = Math.abs(ax[1]) > DEAD ? ax[1] : 0;
  keys.KeyA = !!(lx < -DEAD || b[14]?.pressed);
  keys.KeyD = !!(lx >  DEAD || b[15]?.pressed);
  keys.KeyW = !!(ly < -DEAD || b[12]?.pressed);
  keys.KeyS = !!(ly >  DEAD || b[13]?.pressed);

  // Serve aim: right stick → G.srvAim, clamped to service box bounds
  if ((G.state === 'serve' || G.state === 'toss') && servingPlayer() === 0) {
    const rx = Math.abs(ax[2]) > DEAD ? ax[2] : 0;
    const ry = Math.abs(ax[3]) > DEAD ? ax[3] : 0;
    if (rx || ry) {
      const bb = serveBoxBounds();
      G.srvAim.x = clamp(G.srvAim.x + rx * AIM_SPD * dt, bb.x1, bb.x2);
      G.srvAim.z = clamp(G.srvAim.z + ry * AIM_SPD * dt, bb.z1, bb.z2);
    }
  }

  // PS5 face button → key code mapping
  // ✕(0)=topspin · ○(1)=flat · □(2)=slice · △(3)=lob
  const strokeCode = { 0: 'KeyJ', 1: 'KeyL', 2: 'KeyK', 3: 'KeyI', 5: 'Semicolon' };

  // Serve type for each face button (△ triggers a kick serve, same high arc as lob)
  const serveType  = { 0: 'kick', 1: 'flat', 2: 'slice', 3: 'kick' };

  // Mirror face + R1 held-state into keys so player.js charge mechanic releases on button-up
  for (const [i, code] of Object.entries(strokeCode)) {
    keys[code] = !!(b[i]?.pressed);
  }

  // Face buttons: toss in serve state · strike in toss state · stroke in live state
  for (const i of [0, 1, 2, 3]) {
    if (!hit(i)) continue;
    if (G.state === 'serve' && servingPlayer() === 0) {
      startToss(0);
      break; // one toss at a time
    } else if (G.state === 'toss' && G.toss && G.toss.by === 0) {
      strikeServe(serveType[i]);
      break;
    } else {
      strokePress(strokeCode[i]);
    }
  }

  // R1 → drop shot (rally only)
  if (hit(5)) strokePress(strokeCode[5]);

  prev = b.map(btn => btn?.pressed ?? false);
}
