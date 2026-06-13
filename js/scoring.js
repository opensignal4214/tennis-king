import { PT_NAME } from './constants.js';
import { G } from './state.js';
import { name } from './utils.js';

export function newScore() {
  return { pts:[0,0], games:[0,0], sets:[0,0], setHist:[], tb:false, tbPts:[0,0], tbStart:0, done:false, winner:null };
}

export function servingPlayer() {
  const s = G.score;
  if (G.mode === 'rally' || !s) return 0;
  if (s.tb) {
    const n = s.tbPts[0] + s.tbPts[1];
    return (Math.floor((n + 1) / 2) % 2) ? 1 - s.tbStart : s.tbStart;
  }
  return G.server;
}

export function serveSide() {
  const s = G.score;
  if (G.mode === 'rally' || !s) return 'deuce';
  const n = s.tb ? s.tbPts[0] + s.tbPts[1] : s.pts[0] + s.pts[1];
  return n % 2 === 0 ? 'deuce' : 'ad';
}

export function winSetCheck(w, m) {
  const s = G.score, o = 1 - w, gw = s.games[w], go = s.games[o];
  if ((gw >= 6 && gw - go >= 2) || gw === 7) {
    s.sets[w]++; s.setHist.push([s.games[0], s.games[1]]);
    m.push(`Set ${name(w)} ${gw}–${go}`);
    s.games = [0, 0];
    if (s.sets[w] === 2) { s.done = true; s.winner = w; }
  } else if (gw === 6 && go === 6) {
    s.tb = true; s.tbStart = G.server; s.tbPts = [0, 0]; m.push('Tiebreak');
  }
}

export function addPoint(w) {
  const s = G.score, o = 1 - w, m = [];
  if (s.tb) {
    s.tbPts[w]++;
    if (s.tbPts[w] >= 7 && s.tbPts[w] - s.tbPts[o] >= 2) {
      s.games[w]++; m.push(`Game ${name(w)}`);
      const wasStart = s.tbStart; s.tb = false;
      winSetCheck(w, m);
      G.server = 1 - wasStart;
    } else m.push(`Tiebreak ${s.tbPts[servingPlayer()]} – ${s.tbPts[1 - servingPlayer()]}`);
  } else {
    s.pts[w]++;
    const a = s.pts[w], b = s.pts[o];
    if (a >= 4 && a - b >= 2) {
      s.pts = [0, 0]; s.games[w]++; m.push(`Game ${name(w)}`);
      winSetCheck(w, m); G.server = 1 - G.server;
    } else if (a >= 3 && b >= 3) {
      m.push(a === b ? 'Deuce' : `Advantage ${name(a > b ? w : o)}`);
    } else {
      m.push(`${PT_NAME[s.pts[G.server]]} – ${PT_NAME[s.pts[1 - G.server]]}`);
    }
  }
  return m.join('  ·  ');
}
