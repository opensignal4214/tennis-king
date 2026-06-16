import { DIFF, PT_NAME, COLORS } from './constants.js';
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
export const liveEl   = $('livestats');

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

// Broadcast-style strip (top-right). Persists like a TV lower-third: it stays up
// and is replaced when the next point ends — it does not fade on a timer.
// Match mode only — rally mode has its own #rallyhud.
export function flashLiveStats() {
  const S = G.matchStats;
  if (!S || G.mode === 'rally') { liveEl.style.opacity = 0; return; }
  const pill = t => `<span class="ls-pill">${t}</span>`;
  const spd = G._lastServeKmh ? pill(`🎾 ${G._lastServeKmh} km/h`) : '';
  const onStreak = S.streak[0] >= 2 ? 0 : S.streak[1] >= 2 ? 1 : -1;
  const streak = onStreak >= 0
    ? `<span class="ls-pill ${onStreak === 0 ? 'good' : 'bad'}">▲ ${S.streak[onStreak]} ${onStreak === 0 ? 'You' : 'CPU'}</span>`
    : '';
  liveEl.innerHTML = spd
    + pill(`Rally ${G.rally}`)
    + pill(`W ${S.winners[0]}–${S.unforced[0]} UE`)
    + streak;
  liveEl.style.opacity = 1;
}

export function hideLiveStats() { liveEl.style.opacity = 0; liveEl.innerHTML = ''; }

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
  const dot = (col) => `<span style="display:inline-block;width:.65em;height:.65em;border-radius:50%;background:${col};vertical-align:middle;margin-right:.25em"></span>`;
  const ball = `<span class="srv">🎾</span>`;
  if (G.matchType === 'doubles') {
    const humanServes = sv < 2;
    const cpuServes   = !humanServes;
    const pc = COLORS[G.playerColor]?.shirt || '#2dd9c0';
    const ptc = COLORS[G.partnerColor]?.shirt || '#4a90e2';
    const nc = COLORS[G.npcColors?.[0]]?.shirt || '#ff6b57';
    const n2c = COLORS[G.npcColors?.[1]]?.shirt || '#f5a623';
    hudEl.innerHTML = `<table>
      <tr class="hdr"><td></td><td>${s.setHist.length ? 'Sets' : ''}</td><td>S</td><td>G</td><td>Pts</td><td></td></tr>
      <tr><td class="nm">${dot(pc)}${dot(ptc)}You</td><td>${hist(0)}</td><td>${s.sets[0]}</td><td>${s.games[0]}</td><td>${pts(0)}</td><td>${humanServes ? ball : ''}</td></tr>
      <tr><td class="nm">${dot(nc)}${dot(n2c)}CPU</td><td>${hist(1)}</td><td>${s.sets[1]}</td><td>${s.games[1]}</td><td>${pts(1)}</td><td>${cpuServes ? ball : ''}</td></tr>
    </table>`;
  } else {
    hudEl.innerHTML = `<table>
      <tr class="hdr"><td></td><td>${s.setHist.length ? 'Sets' : ''}</td><td>S</td><td>G</td><td>Pts</td><td></td></tr>
      <tr><td class="nm">You</td><td>${hist(0)}</td><td>${s.sets[0]}</td><td>${s.games[0]}</td><td>${pts(0)}</td><td>${sv === 0 ? ball : ''}</td></tr>
      <tr><td class="nm">CPU</td><td>${hist(1)}</td><td>${s.sets[1]}</td><td>${s.games[1]}</td><td>${pts(1)}</td><td>${sv === 1 ? ball : ''}</td></tr>
    </table>`;
  }
}
