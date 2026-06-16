import { G, keys } from './state.js';
import { ac } from './audio.js';
import { showShot, fb } from './hud.js';
import { startToss, strikeServe } from './serve.js';
import { strokePress } from './player.js';
import { openMenu, closeMenu } from './match.js';
import { servingPlayer } from './scoring.js';
import { downloadLog } from './logger.js';

const PREVENT = ['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Semicolon'];

window.addEventListener('keydown', e => {
  if (PREVENT.includes(e.code)) e.preventDefault();
  if (keys[e.code]) return;
  keys[e.code] = true;
  ac();
  if (e.code === 'Escape') {
    if (G.started && G.paused) closeMenu();
    else if (G.started) openMenu();
    return;
  }
  if (e.code === 'KeyM') { G.mute = !G.mute; showShot(G.mute ? 'Sound off' : 'Sound on'); return; }
  if (e.code === 'KeyG') { downloadLog(); showShot('Log saved'); return; }
  if (e.code === 'KeyH') { document.getElementById('controlsCard')?.classList.toggle('hidden'); return; }
  if (G.paused || G.state === 'menu') return;
  if (e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'KeyL' || e.code === 'KeyI' || e.code === 'Semicolon') {
    if (G.state === 'serve' && servingPlayer() === 0 && e.code !== 'Semicolon') {
      startToss(0); return;
    }
    if (G.state === 'toss' && G.toss && G.toss.by === 0) {
      if (e.code === 'KeyJ' || e.code === 'KeyI') { strikeServe('kick'); return; }
      if (e.code === 'KeyK') { strikeServe('slice'); return; }
      if (e.code === 'KeyL') { strikeServe('flat'); return; }
      return;
    }
    strokePress(e.code);
  }
});

window.addEventListener('keyup', e => { keys[e.code] = false; });
// A missed keyup (alt-tab, focus loss) would leave a key logically stuck down; reset on blur.
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
