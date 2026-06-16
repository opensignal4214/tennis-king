import { test, expect } from '@playwright/test';
import { runScenario, ratio, DEFAULT_RALLIES } from './scenario.js';

// 1v1 rally-shape matrix. Each entry scripts a deterministic rally of the named
// shape, plays up to RALLIES exchanges, writes the full log to
// test-results/scenario-logs/<name>.json, and asserts the intended shots actually
// happened. Customise the rally count with the RALLIES env var, e.g.
//   RALLIES=12 npm run test:e2e -- scenarios
// or per scenario via the `rallies` field below.
//
// `human`/`npc`: { wing: 'fore'|'back', net: bool }. `shot` is the human's stroke.
// Expectations are tolerant of the one un-counted baseline warm-up shot and the
// occasional smash on a high ball.

const SCENARIOS = [
  { name: 'forehand-forehand', human: { wing: 'fore', net: false }, npc: { wing: 'fore', net: false }, shot: 'topspin', expect: { pWing: 'fore', nWing: 'fore', pKind: 'ground', nKind: 'ground' } },
  { name: 'forehand-backhand', human: { wing: 'fore', net: false }, npc: { wing: 'back', net: false }, shot: 'topspin', expect: { pWing: 'fore', nWing: 'back', pKind: 'ground', nKind: 'ground' } },
  { name: 'backhand-forehand', human: { wing: 'back', net: false }, npc: { wing: 'fore', net: false }, shot: 'topspin', expect: { pWing: 'back', nWing: 'fore', pKind: 'ground', nKind: 'ground' } },
  { name: 'backhand-backhand', human: { wing: 'back', net: false }, npc: { wing: 'back', net: false }, shot: 'topspin', expect: { pWing: 'back', nWing: 'back', pKind: 'ground', nKind: 'ground' } },
  { name: 'slice-rally',       human: { wing: 'fore', net: false }, npc: { wing: 'fore', net: false }, shot: 'slice',   expect: { pWing: 'fore', nWing: 'fore', pKind: 'ground', nKind: 'ground' } },
  // Net exchanges are fast and real-time-timing sensitive — run them on 'easy'
  // (slower balls = a wider wall-clock reaction window) for stability.
  { name: 'volley-volley',     diff: 'easy', human: { wing: 'fore', net: true },  npc: { wing: 'fore', net: true },  shot: 'flat',    expect: { pVolley: true, nVolley: true } },
  { name: 'groundstroke-volley', diff: 'easy', human: { wing: 'fore', net: false }, npc: { wing: 'fore', net: true }, shot: 'flat',   expect: { pKind: 'ground', nVolley: true } },
  { name: 'volley-groundstroke', diff: 'easy', human: { wing: 'fore', net: true },  npc: { wing: 'fore', net: false }, shot: 'flat',  expect: { pVolley: true, nKind: 'ground' } },
];

const count = (arr, v) => arr.filter(x => x === v).length;
// A "net shot" is anything hit before the bounce: a volley or a smash (a high ball
// at the net triggers a smash — see js/npc.js / js/player.js). Both confirm net play.
const netShots = arr => count(arr, 'volley') + count(arr, 'smash');

for (const sc of SCENARIOS) {
  test(`rally shape: ${sc.name}`, async ({ page }) => {
    test.setTimeout(60_000 + (sc.rallies ?? DEFAULT_RALLIES) * 8_000);
    const r = await runScenario(page, { seed: 777, diff: 'medium', ...sc });

    // Always: clean run, the rally actually happened, ball logged sanely.
    expect(r.errors, r.errors.join('\n')).toEqual([]);
    expect(r.exchanges, 'at least one scripted exchange completed').toBeGreaterThanOrEqual(1);
    expect(r.summary.playerShots).toBeGreaterThanOrEqual(1);
    expect(r.summary.npcShots).toBeGreaterThanOrEqual(1);

    const e = sc.expect;
    // Wing dominance (tolerant of warm-up/smash noise).
    if (e.pWing) expect(ratio(r.summary.playerWings, e.pWing), `human ${e.pWing} dominance`).toBeGreaterThanOrEqual(0.75);
    if (e.nWing) expect(ratio(r.summary.npcWings, e.nWing), `npc ${e.nWing} dominance`).toBeGreaterThanOrEqual(0.75);
    // Ground-stroke dominance.
    if (e.pKind) expect(ratio(r.summary.playerKinds, e.pKind), `human ${e.pKind} dominance`).toBeGreaterThanOrEqual(0.7);
    if (e.nKind) expect(ratio(r.summary.npcKinds, e.nKind), `npc ${e.nKind} dominance`).toBeGreaterThanOrEqual(0.7);
    // Net play: the intended side actually hit at the net (volley or smash).
    if (e.pVolley) expect(netShots(r.summary.playerKinds), 'human net shots').toBeGreaterThanOrEqual(1);
    if (e.nVolley) expect(netShots(r.summary.npcKinds), 'npc net shots').toBeGreaterThanOrEqual(1);

    // Surface a one-line summary in the test output for quick inspection.
    console.log(`[${sc.name}] exchanges=${r.exchanges} `
      + `player=${r.summary.playerKinds.join('/')} npc=${r.summary.npcKinds.join('/')} `
      + `log=${r.logFile}`);
  });
}
