import { describe, it, expect, beforeEach } from 'vitest';
import { G } from '../../js/state.js';
import { addPoint, serveSide, servingPlayer, winSetCheck, newScore } from '../../js/scoring.js';

function resetScore() {
  G.score = newScore();
  G.server = 0;
  G.mode = 'match';
  G.matchType = 'singles';
  G.serveOrder = [];
  G.serveOrderIdx = 0;
}

// ─── Basic point progression ──────────────────────────────────────────────────

describe('addPoint — basic progression', () => {
  beforeEach(resetScore);

  it('0-0 → 15-0 message, pts[0] becomes 1', () => {
    const msg = addPoint(0);
    expect(msg).toBe('15 – 0');
    expect(G.score.pts[0]).toBe(1);
  });

  it('0→15→30→40 message sequence', () => {
    addPoint(0); addPoint(0);
    const msg = addPoint(0);
    expect(msg).toBe('40 – 0');
  });

  it('fourth consecutive point awards a game', () => {
    addPoint(0); addPoint(0); addPoint(0); addPoint(0);
    expect(G.score.games[0]).toBe(1);
    expect(G.score.pts).toEqual([0, 0]);
  });

  it('server switches after game in singles', () => {
    G.server = 0;
    addPoint(0); addPoint(0); addPoint(0); addPoint(0);
    expect(G.server).toBe(1);
  });

  it('opponent can win points too', () => {
    addPoint(0); addPoint(1);
    expect(G.score.pts[0]).toBe(1);
    expect(G.score.pts[1]).toBe(1);
  });
});

// ─── Deuce and advantage ──────────────────────────────────────────────────────

describe('addPoint — deuce and advantage', () => {
  beforeEach(resetScore);

  it('4-3 points from 3-3 yields Advantage message', () => {
    addPoint(0); addPoint(0); addPoint(0);
    addPoint(1); addPoint(1); addPoint(1);
    const msg = addPoint(0); // 4-3
    expect(msg).toContain('Advantage');
  });

  it('game awarded after winning two consecutive from deuce', () => {
    addPoint(0); addPoint(0); addPoint(0);
    addPoint(1); addPoint(1); addPoint(1);
    addPoint(0); // Adv You
    addPoint(0); // Game You
    expect(G.score.games[0]).toBe(1);
    expect(G.score.pts).toEqual([0, 0]);
  });

  it('returns to opponent advantage after losing advantage', () => {
    addPoint(0); addPoint(0); addPoint(0);
    addPoint(1); addPoint(1); addPoint(1);
    addPoint(0); // Adv You
    addPoint(1); // Deuce
    const msg = addPoint(1); // Adv CPU
    expect(msg).toContain('Advantage');
    expect(msg).toContain('CPU');
  });

  it('deuce message at 3-3', () => {
    addPoint(0); addPoint(0); addPoint(0);
    addPoint(1); addPoint(1); addPoint(1);
    // pts are 3-3, the NEXT point decides: one more point for each → stays deuce
    // pts[0]=3, pts[1]=3 at this point. Let's add one and return to deuce
    addPoint(0); // Adv You
    const msg = addPoint(1); // back to deuce
    expect(msg).toBe('Deuce');
  });
});

// ─── serveSide ────────────────────────────────────────────────────────────────

describe('serveSide', () => {
  beforeEach(resetScore);

  it('deuce at 0+0=0 total points (even)', () => {
    G.score.pts = [0, 0];
    expect(serveSide()).toBe('deuce');
  });

  it('ad at 1+0=1 total points (odd)', () => {
    G.score.pts = [1, 0];
    expect(serveSide()).toBe('ad');
  });

  it('deuce at 1+1=2 total points (even)', () => {
    G.score.pts = [1, 1];
    expect(serveSide()).toBe('deuce');
  });

  it('ad at 3+0=3 total points (odd)', () => {
    G.score.pts = [3, 0];
    expect(serveSide()).toBe('ad');
  });

  it('rally mode always returns deuce', () => {
    G.mode = 'rally';
    G.score.pts = [1, 0]; // odd, would be 'ad' in match mode
    expect(serveSide()).toBe('deuce');
  });
});

// ─── Tiebreak ─────────────────────────────────────────────────────────────────

describe('tiebreak', () => {
  beforeEach(resetScore);

  it('triggers at 6-6 games', () => {
    G.score.games = [6, 6];
    const msgs = [];
    winSetCheck(0, msgs);
    expect(G.score.tb).toBe(true);
    expect(msgs).toContain('Tiebreak');
  });

  it('tiebreak won at 7-0', () => {
    G.score.games = [6, 6];
    winSetCheck(0, []); // trigger tb
    for (let i = 0; i < 7; i++) addPoint(0);
    expect(G.score.sets[0]).toBe(1);
    expect(G.score.tb).toBe(false);
  });

  it('tiebreak not won at 7-5 (only 2-point gap wins)', () => {
    G.score.games = [6, 6];
    winSetCheck(0, []);
    for (let i = 0; i < 5; i++) addPoint(0);
    for (let i = 0; i < 5; i++) addPoint(1);
    addPoint(0); addPoint(1); // 6-6
    addPoint(0); // 7-6 — not won
    expect(G.score.sets[0]).toBe(0);
    expect(G.score.tb).toBe(true);
  });

  it('tiebreak won at 7-5 (2-point gap)', () => {
    G.score.games = [6, 6];
    winSetCheck(0, []);
    for (let i = 0; i < 5; i++) addPoint(0);
    for (let i = 0; i < 5; i++) addPoint(1); // 5-5
    addPoint(0); addPoint(1); // 6-6
    addPoint(0); addPoint(0); // 8-6 — win (2-point gap, above 7)

    // Actually need tbPts[w] >= 7 && gap >= 2:
    // We went: 5-5, 6-5, 6-6, 7-6, 8-6 → tbPts[0]=8 >= 7, gap=2 → win
    expect(G.score.sets[0]).toBe(1);
  });
});

// ─── Set and match ────────────────────────────────────────────────────────────

describe('set and match', () => {
  beforeEach(resetScore);

  it('set won at 6-3', () => {
    G.score.games = [5, 3];
    G.score.games[0]++;
    const msgs = [];
    winSetCheck(0, msgs);
    expect(G.score.sets[0]).toBe(1);
    expect(msgs[0]).toContain('Set');
  });

  it('set not won at 5-4 (needs 2-game gap or reach 7)', () => {
    G.score.games = [4, 4];
    G.score.games[0]++;
    const msgs = [];
    winSetCheck(0, msgs);
    expect(G.score.sets[0]).toBe(0);
    expect(msgs).toHaveLength(0);
  });

  it('7-5 wins the set', () => {
    G.score.games = [6, 5];
    G.score.games[0]++;
    const msgs = [];
    winSetCheck(0, msgs);
    expect(G.score.sets[0]).toBe(1);
  });

  it('games reset to 0-0 after set won', () => {
    G.score.games = [5, 2];
    G.score.games[0]++;
    winSetCheck(0, []);
    expect(G.score.games).toEqual([0, 0]);
  });

  it('match done at 2 sets', () => {
    G.score.sets = [1, 0];
    G.score.games = [5, 3];
    G.score.games[0]++;
    winSetCheck(0, []);
    expect(G.score.done).toBe(true);
    expect(G.score.winner).toBe(0);
  });

  it('match not done after winning first set only (1-0 sets)', () => {
    G.score.sets = [0, 0];
    G.score.games = [5, 3];
    G.score.games[0]++;
    winSetCheck(0, []);
    expect(G.score.done).toBe(false);
    expect(G.score.sets[0]).toBe(1);
  });
});
