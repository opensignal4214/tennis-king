import { test, expect } from '@playwright/test';
import {
  gotoGame, startSinglesMatch, startRally, humanServe,
  waitForState, snapshot, getLog, installSeed,
  setServeAim, waitServeBounce, scriptedReturn, pointEvents,
} from './helpers.js';

// Fail any test that produces a page-level JS error or console.error.
function attachErrorGuard(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  return errors;
}

const isFinite3 = b => [b.x, b.y, b.z].every(Number.isFinite);

test('boots to the menu with state and logger initialised', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await gotoGame(page);

  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#cv')).toBeVisible();
  const s = await snapshot(page);
  expect(s.state).toBe('menu');
  expect(errors).toEqual([]);
});

test('starting a singles match opens a match log and reaches serve state', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await gotoGame(page);
  await startSinglesMatch(page, 'medium');

  const s = await snapshot(page);
  expect(s.state).toBe('serve');
  expect(s.mode).toBe('match');

  const log = await getLog(page);
  expect(log.matches.length).toBeGreaterThanOrEqual(1);
  expect(log.matches.at(-1).diffKey).toBe('medium');
  expect(errors).toEqual([]);
});

test('a human serve goes live, logs a serve event, and produces a finite trajectory', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await gotoGame(page);
  await startRally(page, 'easy'); // rally mode: human serves, no scoring noise

  // In rally mode the human is the server; toss + strike flat.
  await humanServe(page, 'flat');

  // Either the serve went live, or it faulted back to serve — retry once if so.
  let s = await snapshot(page);
  if (s.state === 'serve') {
    await humanServe(page, 'flat');
    s = await snapshot(page);
  }

  // Ball should be live and moving with finite coordinates.
  await waitForState(page, () => window.G.ball.active && Number.isFinite(window.G.ball.vz));
  s = await snapshot(page);
  expect(isFinite3(s.ball)).toBe(true);

  // A serve event must be recorded on the currently-open point, correctly
  // labelled 'serve' with the shot type preserved as serveType.
  const serveEvents = (await pointEvents(page)).filter(e => e.type === 'serve');
  expect(serveEvents.length).toBeGreaterThanOrEqual(1);
  for (const ev of serveEvents) {
    expect(ev.serveType).toBe('flat');
    expect(Number.isFinite(ev.speed)).toBe(true);
    expect(isFinite3(ev.snap.ball)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('rally runs for a few seconds without errors and the ball stays finite', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await gotoGame(page);
  await startRally(page, 'medium');
  await humanServe(page, 'flat');

  // Let the point play out for a bit, sampling the ball.
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const s = await snapshot(page);
    expect(isFinite3(s.ball)).toBe(true);
    await page.waitForTimeout(250);
  }
  expect(errors).toEqual([]);

  // Capture a reference screenshot artifact of live play.
  await page.screenshot({ path: 'playwright-report/rally-live.png' });
});

test('a placed serve lands in the correct service box near its aim', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await installSeed(page, 12345); // deterministic serve noise
  await gotoGame(page);
  await startRally(page, 'easy'); // rally => human serves into the deuce box

  // Aim at the centre-ish of the deuce service box (bounds x[-3.85,-0.25] z[-6,-1]).
  const aim = { x: -2.0, z: -3.5 };
  await setServeAim(page, aim.x, aim.z);
  await humanServe(page, 'flat');

  const bounce = await waitServeBounce(page);
  // The game's own legality check must agree the serve landed in the box.
  expect(bounce.serveBoxOK).toBe(true);
  // And the landing should be on the correct side and reasonably near the aim.
  const land = bounce.snap.ball;
  expect(land.z).toBeLessThan(0);              // CPU side of the net
  expect(land.x).toBeGreaterThan(-3.85);       // inside deuce box laterally
  expect(land.x).toBeLessThan(-0.25);
  expect(Math.hypot(land.x - aim.x, land.z - aim.z)).toBeLessThan(2.5);
  expect(errors).toEqual([]);
});

test('a scripted rally returns at least one NPC shot back over the net', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await installSeed(page, 24680);
  await gotoGame(page);
  await startRally(page, 'easy');

  await setServeAim(page, -2.0, -3.5);
  await humanServe(page, 'flat');

  // Attempt several scripted returns; succeed as soon as the human makes contact.
  let connected = false;
  for (let i = 0; i < 4 && !connected; i++) {
    connected = await scriptedReturn(page, 'KeyL');
  }
  expect(connected).toBe(true);

  // The log must show the player's groundstroke and the rally advancing past the
  // serve. (Read rally from the logged 'hit' events, not live G.rally, which
  // resets to 0 the instant a point ends.)
  const events = await pointEvents(page);
  const playerShots = events.filter(e => e.type === 'playerShot');
  expect(playerShots.length).toBeGreaterThanOrEqual(1);
  expect(playerShots.every(e => Number.isFinite(e.depth ?? 0))).toBe(true);

  const maxRally = Math.max(0, ...events.filter(e => e.type === 'hit').map(e => e.rally ?? 0));
  expect(maxRally).toBeGreaterThanOrEqual(2); // serve (1) + at least one rally hit
  expect(errors).toEqual([]);
});
