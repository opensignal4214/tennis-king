// Shared Playwright helpers for driving Court King.
//
// The game exposes two globals we rely on:
//   window.G      — the single mutable game-state object (js/state.js)
//   window.LOGGER — the structured match/point/event log (js/logger.js)
//
// We never reach into module internals; we drive the game the way a human does
// (DOM menu clicks + keyboard) and observe through G / LOGGER. Serves are timed
// by polling the live toss clock so they don't depend on wall-clock drift.

const TOSS_APEX = 0.57; // js/constants.js — strike here for a clean serve
const PRESS_LEAD = 0.10; // js/constants.js — strokePress target (err = strike.t - PRESS_LEAD)

/**
 * Replace Math.random with a seeded LCG (same algorithm as test/helpers/seedRng.js)
 * so serves, NPC choices and shot noise are deterministic. Must be called BEFORE
 * gotoGame — it installs an init script that runs before the page's own scripts.
 */
export async function installSeed(page, seed = 12345) {
  await page.addInitScript((s) => {
    let state = s >>> 0;
    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }, seed);
}

/** Navigate to the game and wait until state is initialised and the menu is up. */
export async function gotoGame(page) {
  // Resolve to the baseURL exactly ('/tennis-king/'), NOT origin root. goto('/')
  // would drop the base path, so relative runtime fetches (e.g. sounds/*.wav) would
  // resolve to /sounds/* and 404 once audio initialises (notably in headed mode).
  await page.goto('./');
  await page.waitForFunction(() => window.G && window.LOGGER);
  await page.waitForSelector('#menu', { state: 'visible' });
}

/** Poll a predicate evaluated in the page until it returns truthy (or time out). */
export async function waitForState(page, predicate, opts = {}) {
  await page.waitForFunction(predicate, undefined, { timeout: opts.timeout ?? 10_000, polling: 50 });
}

/** Read a snapshot of the bits of G we assert on most. */
export function snapshot(page) {
  return page.evaluate(() => {
    const G = window.G;
    return {
      state: G.state,
      mode: G.mode,
      rally: G.rally,
      score: G.score ? JSON.parse(JSON.stringify(G.score)) : null,
      ball: { x: G.ball.x, y: G.ball.y, z: G.ball.z, active: G.ball.active, isServe: G.ball.isServe },
      serveT: G.serveT,
    };
  });
}

/** Start a singles match via the real menu flow (Match Play → Singles). */
export async function startSinglesMatch(page, diff = 'medium') {
  await page.evaluate((d) => { window.G.diffKey = d; }, diff);
  await page.click('#matchBtn');
  await page.click('#btn1v1');
  await waitForState(page, () => window.G.state === 'serve');
}

/** Start free-hitting rally mode. */
export async function startRally(page, diff = 'medium') {
  await page.evaluate((d) => { window.G.diffKey = d; }, diff);
  await page.click('#rallyBtn');
  await waitForState(page, () => window.G.state === 'serve');
}

/** True when the human (player 0) is the one due to serve (serve timer disabled). */
export function humanIsServing(page) {
  return page.evaluate(() => window.G.state === 'serve' && window.G.serveT === Infinity);
}

/**
 * Perform one human serve: toss, wait for the toss to reach its apex, then
 * strike. Returns once the ball is live ('live') or a fault sent us back to
 * 'serve'/'point'. `type` is 'flat' (L), 'slice' (K) or 'kick' (J).
 */
export async function humanServe(page, type = 'flat') {
  const key = type === 'kick' ? 'KeyJ' : type === 'slice' ? 'KeyK' : 'KeyL';
  // Toss
  await page.keyboard.press('Space');
  await waitForState(page, () => window.G.state === 'toss' && window.G.toss, { timeout: 6000 });
  // Strike near the apex by polling the live toss clock.
  await page.waitForFunction((apex) => window.G.toss && window.G.toss.t >= apex - 0.02,
    TOSS_APEX, { timeout: 6000, polling: 5 });
  await page.keyboard.press(key);
  // Resolve to a terminal serve outcome.
  await waitForState(page, () => ['live', 'point'].includes(window.G.state)
    || (window.G.state === 'serve' && (!window.G.toss)), { timeout: 5000 });
}

/** Set the human serve aim target (used by fireServe for sv===0). Call after
 * reaching 'serve' state so setupServe doesn't re-clamp it. */
export async function setServeAim(page, x, z) {
  await page.evaluate(({ x, z }) => { window.G.srvAim = { x, z }; }, { x, z });
}

// Events of the current point may live in LOGGER.point (open) or, once the point
// ends (e.g. an ace), be flushed into the last match's points[]. This predicate
// (stringified into the page) returns events from both so a fast-ending point
// isn't missed.
const POINT_EVENTS_FN = () => {
  const open = window.LOGGER.point?.events ?? [];
  const lastMatch = window.LOGGER.matches[window.LOGGER.matches.length - 1];
  const ended = (lastMatch?.points ?? []).flatMap(p => p.events);
  return [...ended, ...open];
};

/** Events of the current/most-recent point (open point + last match's ended points). */
export function pointEvents(page) {
  return page.evaluate(POINT_EVENTS_FN);
}

/** Events of just the currently-open point (not yet flushed to a match record). */
export function openPointEvents(page) {
  return page.evaluate(() => window.LOGGER.point?.events ?? []);
}

/** Wait for, and return, the serve's first-bounce event (bounceN 0, isServe). */
export async function waitServeBounce(page) {
  await page.waitForFunction((fn) => new Function('return (' + fn + ')()')()
    .some(e => e.type === 'bounce' && e.isServe && e.bounceN === 0),
    POINT_EVENTS_FN.toString(), { timeout: 8000, polling: 30 });
  const events = await pointEvents(page);
  return events.find(e => e.type === 'bounce' && e.isServe && e.bounceN === 0);
}

/**
 * Execute one scripted return: wait until the ball is incoming from the NPC
 * (G.strike populated), teleport the player into reach at the predicted contact
 * x, then strike inside the timing window. Returns true if a playerShot was
 * logged (the human made contact). `key` selects the stroke (KeyL/KeyK/KeyJ).
 */
export async function scriptedReturn(page, key = 'KeyL') {
  const before = (await pointEvents(page)).filter(e => e.type === 'playerShot').length;
  // Wait for an incoming ball with the strike clock inside a comfortable window.
  const ok = await page.waitForFunction(() => {
    const st = window.G.strike;
    return window.G.state === 'live' && st && st.t > 0.0 && st.t < 0.32;
  }, undefined, { timeout: 6000, polling: 5 }).then(() => true).catch(() => false);
  if (!ok) return false;
  // Teleport into reach at the predicted contact point, kill drift, then strike.
  await page.evaluate(() => {
    const st = window.G.strike;
    if (st) { window.G.player.x = st.x; window.G.player.vx = 0; }
  });
  await page.keyboard.press(key);
  // Did contact register?
  await page.waitForFunction((args) => new Function('return (' + args.fn + ')()')()
    .filter(e => e.type === 'playerShot').length > args.n, { fn: POINT_EVENTS_FN.toString(), n: before },
    { timeout: 1500, polling: 10 }).catch(() => {});
  const after = (await pointEvents(page)).filter(e => e.type === 'playerShot').length;
  return after > before;
}

/** Pull the full structured log out of the page. */
export function getLog(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.LOGGER)));
}

/** All point records across all logged matches, flattened. */
export async function allPoints(page) {
  const log = await getLog(page);
  return log.matches.flatMap(m => m.points);
}
