import { DIFF, PT_NAME } from './constants.js';
import { G } from './state.js';
import { servingPlayer } from './scoring.js';

export const $ = id => document.getElementById(id);

export const hudEl    = $('hud');
export const rallyEl  = $('rallyhud');
export const hintEl   = $('servehint');
export const msgEl    = $('msg');
export const msgMain  = $('msgMain');
export const msgSub   = $('msgSub');
export const shotEl   = $('shotlbl');

let msgTimer = 0;
let shotTimer = 0;

export function showMsg(main, sub, dur) {
  msgMain.textContent = main; msgSub.textContent = sub || '';
  msgEl.style.opacity = 1; msgTimer = dur || 1.6;
}

export function showShot(txt) {
  shotEl.textContent = txt; shotEl.style.opacity = 1; shotTimer = 1.0;
}

export function fb(txt, col) {
  G.fb = { txt, col, age: 0 };
}

export function tickHud(dt) {
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.style.opacity = 0; }
  if (shotTimer > 0) { shotTimer -= dt; if (shotTimer <= 0) shotEl.style.opacity = 0; }
  if (G.fb) { G.fb.age += dt; if (G.fb.age > 0.85) G.fb = null; }
}

export function refreshHUD() {
  if (G.mode === 'rally') {
    hudEl.style.display = 'none';
    rallyEl.style.display = G.state === 'menu' ? 'none' : 'block';
    rallyEl.innerHTML = `Rally <b>${G.rally}</b> &nbsp;·&nbsp; Best <b>${G.bestRally}</b> &nbsp;·&nbsp; ${DIFF[G.diffKey].label}`;
    return;
  }
  rallyEl.style.display = 'none';
  if (!G.score) { hudEl.style.display = 'none'; return; }
  hudEl.style.display = 'block';
  const s = G.score, sv = servingPlayer();
  const pts = i => {
    if (s.done) return '';
    if (s.tb) return s.tbPts[i];
    const a = s.pts[i], b = s.pts[1 - i];
    if (a >= 3 && b >= 3) return a === b ? '40' : (a > b ? 'Ad' : '–');
    return PT_NAME[Math.min(a, 3)];
  };
  const hist = i => s.setHist.map(h => h[i]).join(' ');
  hudEl.innerHTML = `<table>
    <tr class="hdr"><td></td><td>${s.setHist.length ? 'Sets' : ''}</td><td>S</td><td>G</td><td>Pts</td></tr>
    <tr><td class="nm">${sv === 0 ? '<span class="srv">●</span> ' : ''}You</td><td>${hist(0)}</td><td>${s.sets[0]}</td><td>${s.games[0]}</td><td>${pts(0)}</td></tr>
    <tr><td class="nm">${sv === 1 ? '<span class="srv">●</span> ' : ''}CPU</td><td>${hist(1)}</td><td>${s.sets[1]}</td><td>${s.games[1]}</td><td>${pts(1)}</td></tr>
  </table>`;
}
