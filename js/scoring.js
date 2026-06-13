import { PT_NAME } from './constants.js';
import { G } from './state.js';
import { name } from './utils.js';

export function newScore() {
  return { pts:[0,0], games:[0,0], sets:[0,0], setHist:[], tb:false, tbPts:[0,0], tbStart:0, done:false, winner:null };
}

// Returns entity index: 0=player, 1=partner, 2=npc, 3=npc2 (or 0/1 in singles)
export function servingPlayer() {
  const s = G.score;
  if (G.mode === 'rally' || !s) return 0;
  if (G.matchType === 'doubles') {
    if (s.tb) {
      // Doubles tiebreak: teams alternate every 2 points (first team serves 1, then 2, 2...)
      const n = s.tbPts[0] + s.tbPts[1];
      const teamTurn = (Math.floor((n + 1) / 2) % 2) ? 1 - s.tbStart : s.tbStart;
      // Find first entity in serveOrder belonging to teamTurn
      for (const e of G.serveOrder) {
        if ((e < 2 ? 0 : 1) === teamTurn) return e;
      }
    }
    return G.serveOrder[G.serveOrderIdx % G.serveOrder.length];
  }
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

function advanceServeRotation(w) {
  if (G.matchType === 'doubles') {
    G.serveOrderIdx++;
    // Advance receive rotation for the team that is now receiving
    const nextServer = G.serveOrder[G.serveOrderIdx % G.serveOrder.length];
    const servingTeam = nextServer < 2 ? 0 : 1;
    if (servingTeam === 0) {
      // Human team serves → CPU team receives, advance CPU receiver
      G.receiveCpu ^= 1;
    } else {
      // CPU team serves → Human team receives, advance human receiver
      G.receiveHuman ^= 1;
    }
    // Keep G.server in sync with team for legacy code
    G.server = servingTeam;
  } else {
    G.server = 1 - G.server;
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
      if (G.matchType === 'doubles') {
        advanceServeRotation(w);
      } else {
        G.server = 1 - wasStart;
      }
    } else m.push(`Tiebreak ${s.tbPts[servingPlayer()]} – ${s.tbPts[1 - servingPlayer()]}`);
  } else {
    s.pts[w]++;
    const a = s.pts[w], b = s.pts[o];
    if (a >= 4 && a - b >= 2) {
      s.pts = [0, 0]; s.games[w]++; m.push(`Game ${name(w)}`);
      winSetCheck(w, m); advanceServeRotation(w);
    } else if (a >= 3 && b >= 3) {
      m.push(a === b ? 'Deuce' : `Advantage ${name(a > b ? w : o)}`);
    } else {
      const sv = servingPlayer();
      const svTeam = G.matchType === 'doubles' ? (sv < 2 ? 0 : 1) : sv;
      m.push(`${PT_NAME[s.pts[svTeam]]} – ${PT_NAME[s.pts[1 - svTeam]]}`);
    }
  }
  return m.join('  ·  ');
}
