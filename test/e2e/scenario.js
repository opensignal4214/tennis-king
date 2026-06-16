// Scenario framework for scripting deterministic 1v1 rallies of a chosen shape
// (forehand/backhand × ground/volley on each side) and collecting the structured
// log for self-checking / change verification.
//
// Usage from a spec:
//
//   const r = await runScenario(page, {
//     name: 'forehand-forehand',
//     seed: 777, diff: 'medium', rallies: 10,
//     human: { wing: 'fore', net: false }, npc: { wing: 'fore', net: false },
//     shot: 'topspin',                       // human stroke used for every return
//   });
//   expect(r.exchanges).toBeGreaterThan(0);
//
// `runScenario` serves the point, plays up to `rallies` exchanges, writes the log
// to test-results/scenario-logs/<name>.json, and returns a summary.

import fs from 'fs';
import path from 'path';
import {
  installSeed, gotoGame, startRally, humanServe, setServeAim, pointEvents,
} from './helpers.js';
import { installController, setController, configureSides } from './controller.js';

// Human stroke keys (same mapping ground & volley — see js/player.js doPlayerHit).
const SHOT_KEYS = { topspin: 'KeyJ', slice: 'KeyK', flat: 'KeyL', lob: 'KeyI', drop: 'Semicolon' };

const LOG_DIR = path.resolve('test-results', 'scenario-logs');

// How many rally exchanges by default; override per-call or via RALLIES env.
export const DEFAULT_RALLIES = Number(process.env.RALLIES) || 6;

/**
 * Wait for the ball to be incoming from the NPC inside the timing window, then
 * strike. `burst` re-presses every ~35ms until the ball leaves — needed for fast
 * net exchanges where a single load-delayed press can miss the contact window
 * (each press just refreshes the engine's 0.42s pending, so extra presses are harmless).
 */
async function humanReturn(page, key, { lo = 0.05, hi = 0.16, burst = false } = {}) {
  const ballGone = () => window.G.state !== 'live' || window.G.ball.lastHitter === 0;
  const ok = await page.waitForFunction(({ lo, hi }) => {
    const st = window.G.strike;
    return window.G.state === 'live' && window.G.ball.lastHitter === 1
      && st && st.t > lo && st.t < hi;
  }, { lo, hi }, { timeout: 5000, polling: 4 }).then(() => true).catch(() => false);
  if (!ok) return false;
  await page.keyboard.press(key);
  if (burst) {
    for (let i = 0; i < 8; i++) {
      if (await page.evaluate(ballGone)) break;
      await page.waitForTimeout(35);
      await page.keyboard.press(key);
    }
  }
  // Give the engine time to resolve pending → doPlayerHit and the ball to leave.
  await page.waitForFunction(ballGone, undefined, { timeout: 1500, polling: 10 }).catch(() => {});
  return true;
}

/** Derive a shot's wing from an event snapshot. */
const npcFore = e => (e.snap.ball.x - e.snap.npc.x) <= 0; // js/npc.js: nFore = (b.x-n.x)<=0

/** Summarise the shots that actually happened during the point. */
export function classify(events) {
  const ps = events.filter(e => e.type === 'playerShot');
  const nd = events.filter(e => e.type === 'npcDecision');
  return {
    playerShots: ps.length,
    npcShots: nd.length,
    playerWings: ps.map(e => (e.fore ? 'fore' : 'back')),
    npcWings: nd.map(e => (npcFore(e) ? 'fore' : 'back')),
    playerKinds: ps.map(e => e.animType),       // 'ground' | 'volley' | 'smash'
    npcKinds: nd.map(e => e.shotType === 'volley' ? 'volley' : (e.shotType === 'smash' ? 'smash' : 'ground')),
    playerShotTypes: ps.map(e => e.shotType),
    npcShotTypes: nd.map(e => e.shotType),
  };
}

/** Fraction of items equal to `val` (0..1); empty list → 0. */
export const ratio = (arr, val) => (arr.length ? arr.filter(x => x === val).length / arr.length : 0);

function saveLog(name, payload) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOG_DIR, `${name}.json`), JSON.stringify(payload, null, 2));
}

/**
 * Run one scenario end to end. Options:
 *   name     file-safe scenario id (used for the saved log)
 *   seed     RNG seed (deterministic)            default 777
 *   diff     'easy' | 'medium' | 'hard'          default 'medium'
 *   rallies  target number of exchanges          default DEFAULT_RALLIES
 *   human    { wing:'fore'|'back', net:bool }    how the human plays each ball
 *   npc      { wing:'fore'|'back', net:bool }    how the npc is positioned each ball
 *   shot     human stroke each return            default 'topspin'
 *   serveAim {x,z} serve target                  default deuce box
 *
 * Returns { exchanges, summary, log } and writes the log to disk.
 */
export async function runScenario(page, opts) {
  const {
    name, seed = 777, diff = 'medium', rallies = DEFAULT_RALLIES,
    human = { wing: 'fore', net: false }, npc = { wing: 'fore', net: false },
    shot = 'topspin', serveAim = { x: -2.0, z: -3.5 },
  } = opts;
  const key = SHOT_KEYS[shot] || SHOT_KEYS.topspin;

  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

  await installSeed(page, seed);
  await installController(page);
  await gotoGame(page);
  await startRally(page, diff);
  // Warm-up: both at the baseline for the serve + serve return. A serve can't be
  // volleyed (the NPC ignores serves and a serve lands short of a net player), so
  // net scenarios ramp in from one baseline groundstroke before going to net.
  await configureSides(page, { wing: human.wing, net: false }, { wing: npc.wing, net: false });
  await setServeAim(page, serveAim.x, serveAim.z);
  await humanServe(page, 'flat');
  await setController(page, true);
  const groundWin = { lo: 0.05, hi: 0.16 };
  await humanReturn(page, SHOT_KEYS.topspin, groundWin); // serve return (not counted)

  // Switch to the requested configuration (possibly net) and count exchanges.
  await configureSides(page, human, npc);
  // Net exchanges are fast and load-sensitive: press as early as the engine will
  // accept (err<=0.30 ⇒ strike.t<0.40) so the 0.42s pending window absorbs jitter,
  // rather than chasing a tight late window. Ground rallies keep the tight window
  // for clean, sustained quality.
  const win = human.net ? { lo: -0.08, hi: 0.40, burst: true } : groundWin;

  let exchanges = 0;
  for (let i = 0; i < rallies; i++) {
    if (await humanReturn(page, key, win)) exchanges++;
    else break;
  }

  const events = await pointEvents(page);
  const summary = classify(events);
  const log = await page.evaluate(() => JSON.parse(JSON.stringify(window.LOGGER)));

  saveLog(name, { name, opts: { seed, diff, rallies, human, npc, shot }, exchanges, summary, errors, log });

  return { exchanges, summary, errors, events, log, logFile: path.join(LOG_DIR, `${name}.json`) };
}
