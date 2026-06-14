import { G } from './state.js';
import { name } from './utils.js';
import { sPoint, crowdDuration } from './audio.js';
import { $, showMsg, refreshHUD, hintEl } from './hud.js';
import { newScore } from './scoring.js';
import { setupServe } from './serve.js';
import { addPoint } from './scoring.js';
import { logMatchStart, logPointEnd } from './logger.js';

export function endPoint(w, reason) {
  const rallyLen = G.rally;
  G.state = 'point'; G.strike = null; G.player.pending = null;
  if (w === 0 && rallyLen <= 1 && G.npcMem.lastServeRec) G.npcMem.lastServeRec.w = 2.5;
  G.npcMem.lastServeRec = null;
  sPoint(w);
  if (G.mode === 'rally') {
    G.bestRally = Math.max(G.bestRally, rallyLen);
    logPointEnd({ winner: w, reason, rallyLen, scoreAfter: null, stats: [...G.stats] });
    showMsg(reason, `rally of ${rallyLen}`, 1.5);
    G.pointT = crowdDuration(); G.next = setupServe;
  } else {
    G.stats[w]++;
    G.serveNum = 1;
    const sub = addPoint(w);
    logPointEnd({ winner: w, reason, rallyLen, scoreAfter: JSON.parse(JSON.stringify(G.score)), stats: [...G.stats] });
    showMsg(reason, sub, 1.9);
    const cd = crowdDuration();
    if (G.score.done) { G.pointT = cd; G.next = showGameOver; }
    else { G.pointT = cd; G.next = setupServe; }
  }
  refreshHUD();
}

export function showGameOver() {
  G.state = 'over'; G.started = false;
  const s = G.score, w = s.winner;
  const sets = s.setHist.map(h => `${h[w]}–${h[1 - w]}`).join(', ');
  $('overTxt').style.display = 'block';
  $('overTxt').innerHTML = `<span class="big">${w === 0 ? '🏆 You win the match!' : 'CPU wins the match'}</span>
    <div class="st">${sets} &nbsp;·&nbsp; points won: You ${G.stats[0]} — CPU ${G.stats[1]}</div>`;
  openMenu();
}

export function startGame(mode) {
  G.mode = mode; G.started = true; G.paused = false;
  G.score = mode === 'match' ? newScore() : null;
  logMatchStart();
  G.stats = [0, 0]; G.serveNum = 1; G.rally = 0; G.bestRally = 0;
  // In doubles, G.server is derived from G.serveOrder; in singles always start at 0
  if (G.matchType !== 'doubles') { G.server = 0; G.matchType = 'singles'; G.partner = null; G.npc2 = null; }
  if (mode === 'rally') { G.matchType = 'singles'; G.partner = null; G.npc2 = null; G.server = 0; }
  G.srvAim = { x: -2.05, z: -4.6 };
  G.npcMem = { serve: { deuce: [], ad: [] }, lastServeRec: null, rallyX: 0 };
  $('menu').style.display = 'none';
  $('overTxt').style.display = 'none';
  G.state = 'point';
  const isDoubles = G.matchType === 'doubles';
  const servesFirst = isDoubles ? (G.serveOrder[0] < 2 ? 'you' : 'CPU') : 'you';
  showMsg(
    isDoubles ? 'Doubles Match' : mode === 'match' ? 'Match Play' : 'Rally Mode',
    isDoubles
      ? `best of 3 sets · ${servesFirst} serve first`
      : mode === 'match' ? 'best of 3 sets — you serve first' : 'keep it going as long as you can',
    1.6
  );
  G.pointT = 1.7; G.next = setupServe;
  refreshHUD();
}

export function openMenu() {
  G.paused = true;
  // Hide any open pre-match overlay screens
  ['matchtype', 'colorpick', 'cointoss'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = 'none';
  });
  $('menu').style.display = 'flex';
  $('resumeBtn').style.display = G.started ? 'block' : 'none';
  hintEl.style.display = 'none';
}

export function closeMenu() {
  G.paused = false;
  $('menu').style.display = 'none';
  if (G.state === 'serve') hintEl.style.display = 'block';
}
