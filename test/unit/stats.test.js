import { describe, it, expect, beforeEach } from 'vitest';
import { G } from '../../js/state.js';
import { newStats, ingestPoint, statsTable, landingMapBlock, kmh } from '../../js/stats.js';

const serve = (serveNum, vmag) => ({ type: 'serve', serveNum, vmag });
const fault = (serveNum) => ({ type: 'fault', serveNum });
const bounce = (bounceN, inCourt, isServe, lastHitter, lastHitterEntity, x = 1, z = -5) =>
  ({ type: 'bounce', bounceN, inCourt, isServe, snap: { ball: { x, z, lastHitter, lastHitterEntity } } });

beforeEach(() => {
  G.matchType = 'singles';
  G.matchStats = newStats();
});

describe('newStats', () => {
  it('starts zeroed with four player slots', () => {
    const S = newStats();
    expect(S.pointsWon).toEqual([0, 0]);
    expect(S.players).toHaveLength(4);
    expect(S.landings).toEqual([[], []]);
  });
});

describe('ingestPoint — singles', () => {
  it('counts an ace (unreturned serve) as both ace and winner', () => {
    const rec = { server: 0, events: [
      serve(1, 50),
      bounce(0, true, true, 0, 0),       // serve lands in
      bounce(1, true, false, 0, 0),      // second bounce → winner
    ] };
    ingestPoint(rec, 0, 'Winner!', 1);
    const S = G.matchStats;
    expect(S.pointsWon[0]).toBe(1);
    expect(S.aces[0]).toBe(1);
    expect(S.winners[0]).toBe(1);
    expect(S.firstTotal[0]).toBe(1);
    expect(S.firstIn[0]).toBe(1);
    expect(S.firstWon[0]).toBe(1);
    expect(S.fastServe[0]).toBe(50);
    expect(S.landings[0]).toHaveLength(1);   // only bounceN 0 recorded
    expect(S.streak[0]).toBe(1);
  });

  it('attributes an unforced error to the player who hit out', () => {
    const rec = { server: 1, events: [
      serve(1, 45),
      bounce(0, true, true, 1, 1),
      { type: 'playerShot', q: 'good' },
      bounce(0, false, false, 0, 0, 6, -13),  // player hits long
    ] };
    ingestPoint(rec, 1, 'Out!', 3);   // CPU wins point
    const S = G.matchStats;
    expect(S.pointsWon[1]).toBe(1);
    expect(S.unforced[0]).toBe(1);    // the error is the human's
    expect(S.timing.good).toBe(1);
    expect(S.longestRally).toBe(3);
  });

  it('records a double fault against the server', () => {
    const rec = { server: 0, events: [
      serve(1), fault(1), serve(2), fault(2),
    ] };
    ingestPoint(rec, 1, 'Double Fault', 1);
    const S = G.matchStats;
    expect(S.doubleFaults[0]).toBe(1);
    expect(S.unforced[0]).toBe(1);     // server made the error
    expect(S.aces[0]).toBe(0);
    expect(S.firstIn[0]).toBe(0);      // first serve faulted
    expect(S.secondTotal[0]).toBe(1);
  });
});

describe('ingestPoint — shot wing (forehand/backhand)', () => {
  const hit = (hitter, fore, shotType, x) => ({ type: 'hit', hitter, fore, shotType, snap: { ball: { x } } });

  it('records the wing for player shots from the hit event', () => {
    const rec = { server: 0, events: [
      serve(1, 50), bounce(0, true, true, 0, 0),
      hit(0, true, 'topspin', 1.5), bounce(0, true, false, 0, 0, 2, -6),
    ] };
    ingestPoint(rec, 0, 'Winner!', 3);
    const land = G.matchStats.landings[0];
    expect(land[land.length - 1].fore).toBe(true);
    expect(land[land.length - 1].kind).toBe('ground');
  });

  it('colours CPU shots by wing too (team 1)', () => {
    const rec = { server: 0, events: [
      serve(1, 50), bounce(0, true, true, 0, 0),
      hit(1, false, 'slice', -2), bounce(0, true, false, 1, 1, 3, 6),
    ] };
    ingestPoint(rec, 0, 'Out!', 3);
    const land = G.matchStats.landings[1];
    expect(land).toHaveLength(1);
    expect(land[0].fore).toBe(false);   // backhand
  });

  it('serves carry no wing (neutral)', () => {
    const rec = { server: 0, events: [serve(1, 50), bounce(0, true, true, 0, 0)] };
    ingestPoint(rec, 0, 'Winner!', 1);
    const land = G.matchStats.landings[0];
    expect(land[0].kind).toBe('serve');
    expect(land[0].fore).toBeNull();
  });
});

describe('ingestPoint — doubles per-player', () => {
  beforeEach(() => { G.matchType = 'doubles'; G.matchStats = newStats(); });

  it('attributes serve + error to the right entities', () => {
    const rec = { server: 2, events: [
      serve(1, 48),
      bounce(0, true, true, 1, 2, 1, 5),
      bounce(0, false, false, 0, 1, 6, 13),   // partner (entity 1) hits out
    ] };
    ingestPoint(rec, 1, 'Out!', 2);   // CPU team wins
    const P = G.matchStats.players;
    expect(P[2].firstTotal).toBe(1);
    expect(P[2].firstIn).toBe(1);
    expect(P[2].fastServe).toBe(48);
    expect(P[1].unforced).toBe(1);    // partner made the error
    expect(P[0].unforced).toBe(0);
    expect(G.matchStats.unforced[0]).toBe(1);  // team total too
  });
});

describe('statsTable rendering', () => {
  it('singles table shows headline labels and values', () => {
    const rec = { server: 0, events: [serve(1, 55), bounce(0, true, true, 0, 0), bounce(1, true, false, 0, 0)] };
    ingestPoint(rec, 0, 'Winner!', 1);
    const html = statsTable(G.matchStats);
    expect(html).toContain('Aces');
    expect(html).toContain('Winners');
    expect(html).toContain('Fastest serve');
    expect(html).toContain(String(kmh(55)));
  });

  it('doubles table shows team headers and per-player columns', () => {
    G.matchType = 'doubles'; G.matchStats = newStats();
    const rec = { server: 0, events: [serve(1, 50), bounce(0, true, true, 0, 0), bounce(1, true, false, 0, 0)] };
    ingestPoint(rec, 0, 'Winner!', 1);
    const html = statsTable(G.matchStats);
    expect(html).toContain('Your team');
    expect(html).toContain('CPU team');
    expect(html).toContain('Partner');
  });

  it('shows a placeholder before any points', () => {
    expect(statsTable(newStats())).toContain('No stats yet');
  });
});

describe('landingMapBlock', () => {
  it('singles shows You/CPU toggle and a canvas', () => {
    G.matchType = 'singles';
    const html = landingMapBlock();
    expect(html).toContain('data-lm="0"');
    expect(html).toContain('data-lm="1"');
    expect(html).not.toContain('Partner');
    expect(html).toContain('id="landmap"');
  });

  it('doubles shows four per-player toggles', () => {
    G.matchType = 'doubles';
    const html = landingMapBlock();
    expect(html).toContain('Partner');
    expect(html).toContain('CPU 1');
    expect(html).toContain('data-lm="3"');
  });
});
