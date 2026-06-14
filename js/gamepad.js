import { G, keys } from './state.js';
import { startToss, strikeServe, serveBoxBounds } from './serve.js';
import { strokePress } from './player.js';
import { servingPlayer } from './scoring.js';
import { openMenu, closeMenu } from './match.js';
import { showShot } from './hud.js';
import { clamp } from './utils.js';

const DEAD = 0.2;
const AIM_SPD = 4.5; // match player.js serve-aim speed (4.5 units/sec)

let gpIndex = null;
let prev = [];

const statusEl = document.getElementById('gamepadStatus');

window.addEventListener('gamepadconnected', e => {
  gpIndex = e.gamepad.index;
  if (statusEl) { statusEl.textContent = '🎮 Controller'; statusEl.classList.add('active'); }
  showShot('Controller connected');
});

window.addEventListener('gamepaddisconnected', e => {
  if (e.gamepad.index !== gpIndex) return;
  gpIndex = null;
  prev = [];
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'Semicolon']) keys[k] = false;
  if (statusEl) statusEl.classList.remove('active');
  showShot('Controller disconnected');
});

export function updateGamepad(dt) {
  if (gpIndex === null) return;
  const gp = navigator.getGamepads()[gpIndex];
  if (!gp) return;

  const b = gp.buttons;
  const ax = gp.axes;
  const hit = i => b[i]?.pressed && !prev[i]; // rising edge

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

  // Options → toggle menu/pause
  if (hit(9) && G.started) { G.paused ? closeMenu() : openMenu(); }

  // Create → mute toggle
  if (hit(8)) { G.mute = !G.mute; showShot(G.mute ? 'Sound off' : 'Sound on'); }

  prev = b.map(btn => btn?.pressed ?? false);
}
