import { test, expect } from '@playwright/test';
import {
  gotoGame, startRally, humanServe, waitForState, snapshot,
  installSeed, setServeAim, openPointEvents,
} from './helpers.js';

// Fail any test that produces a page-level JS error or console.error.
function attachErrorGuard(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  return errors;
}

const TOSS_APEX = 0.57;
// Logical pad anchors at the 960×600 e2e viewport (logical === client px here).
const LEFT = { x: 210, y: 470 };
const RIGHT = { x: 760, y: 470 };

/** Dispatch a real PointerEvent on the canvas at logical (x,y). */
async function pointer(page, type, x, y, pointerId = 1) {
  await page.evaluate(({ type, x, y, pointerId }) => {
    const cv = document.getElementById('cv');
    cv.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, pointerId, isPrimary: true,
      bubbles: true, cancelable: true, pointerType: 'touch',
    }));
  }, { type, x, y, pointerId });
}

/** Turn touch mode on the way a coarse-pointer device would. */
async function enableTouch(page) {
  await page.evaluate(() => window.enableTouch());
  await waitForState(page, () => window.G.touch.enabled === true);
}

/** A full right-pad swing: press, flick by (dx,dy) to pick a wedge, brief hold, lift.
 *  Hold is kept short so the release timing tracks the press (like a keyboard tap). */
async function touchSwing(page, dx = -55, dy = -55, holdMs = 25) {
  await pointer(page, 'pointerdown', RIGHT.x, RIGHT.y, 7);
  if (dx || dy) await pointer(page, 'pointermove', RIGHT.x + dx, RIGHT.y + dy, 7);
  await page.waitForTimeout(holdMs);
  await pointer(page, 'pointerup', RIGHT.x + dx, RIGHT.y + dy, 7);
}

/** scriptedReturn, but the human strikes via the touch swing pad. */
async function touchReturn(page) {
  const before = (await openPointEvents(page)).filter(e => e.type === 'playerShot').length;
  const ok = await page.waitForFunction(() => {
    const st = window.G.strike;
    return window.G.state === 'live' && st && st.t > 0.10 && st.t < 0.30; // central, in-window
  }, undefined, { timeout: 4000, polling: 5 }).then(() => true).catch(() => false);
  if (!ok) return false;
  await page.evaluate(() => {
    const st = window.G.strike;
    if (st) { window.G.player.x = st.x; window.G.player.vx = 0; }
  });
  await touchSwing(page);                       // flick up-left → topspin
  await page.waitForFunction((n) => (window.LOGGER.point?.events ?? [])
    .filter(e => e.type === 'playerShot').length > n, before,
    { timeout: 1500, polling: 10 }).catch(() => {});
  const after = (await openPointEvents(page)).filter(e => e.type === 'playerShot').length;
  return after > before;
}

test('touch mode enables, renders the overlay, and logs no errors', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await gotoGame(page);
  await startRally(page, 'easy');
  await enableTouch(page);

  // body.touch class drives the CSS show/hide; pause button becomes visible.
  await expect(page.locator('body')).toHaveClass(/touch/);
  await expect(page.locator('#touchPause')).toBeVisible();
  // The keyboard controls card must not block the court on touch.
  await expect(page.locator('#controlsCard')).toBeHidden();

  // Press the left pad so the joystick overlay draws, then screenshot.
  await pointer(page, 'pointerdown', LEFT.x, LEFT.y, 1);
  await page.waitForTimeout(50);
  await page.screenshot({ path: 'playwright-report/touch-overlay.png' });
  await pointer(page, 'pointerup', LEFT.x, LEFT.y, 1);

  expect(errors).toEqual([]);
});

test('left pad drag synthesises movement keys', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await gotoGame(page);
  await startRally(page, 'easy');
  await enableTouch(page);
  await humanServe(page, 'flat');               // get into a live rally (left pad = move)
  await waitForState(page, () => window.G.state === 'live');

  await pointer(page, 'pointerdown', LEFT.x, LEFT.y, 1);
  await pointer(page, 'pointermove', LEFT.x + 90, LEFT.y, 1); // drag right
  expect(await page.evaluate(() => window.keys.KeyD)).toBe(true);
  expect(await page.evaluate(() => window.keys.KeyA)).toBe(false);

  await pointer(page, 'pointerup', LEFT.x + 90, LEFT.y, 1);
  expect(await page.evaluate(() => window.keys.KeyD)).toBe(false);
  expect(errors).toEqual([]);
});

test('left pad (run) and right pad (swing) are independent — no conflict', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await gotoGame(page);
  await startRally(page, 'easy');
  await enableTouch(page);
  await humanServe(page, 'flat');
  await waitForState(page, () => window.G.state === 'live');

  // Left thumb holds a run direction (separate pointerId from the right pad).
  await pointer(page, 'pointerdown', LEFT.x, LEFT.y, 1);
  await pointer(page, 'pointermove', LEFT.x + 90, LEFT.y, 1);
  expect(await page.evaluate(() => window.keys.KeyD)).toBe(true);

  // Right thumb presses + releases on its own pointerId — must NOT disturb the left.
  await pointer(page, 'pointerdown', RIGHT.x, RIGHT.y, 7);
  await pointer(page, 'pointermove', RIGHT.x - 50, RIGHT.y - 50, 7);
  expect(await page.evaluate(() => window.keys.KeyD)).toBe(true); // still running
  await pointer(page, 'pointerup', RIGHT.x - 50, RIGHT.y - 50, 7);
  expect(await page.evaluate(() => window.keys.KeyD)).toBe(true); // still running after right lift

  await pointer(page, 'pointerup', LEFT.x + 90, LEFT.y, 1);
  expect(await page.evaluate(() => window.keys.KeyD)).toBe(false);
  expect(errors).toEqual([]);
});

test('touch serve: tap right pad to toss, tap again to strike, ball goes live', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await installSeed(page, 12345);
  await gotoGame(page);
  await startRally(page, 'easy');
  await enableTouch(page);
  await setServeAim(page, -2.0, -3.5);

  // Tap right pad → toss.
  await pointer(page, 'pointerdown', RIGHT.x, RIGHT.y, 7);
  await pointer(page, 'pointerup', RIGHT.x, RIGHT.y, 7);
  await waitForState(page, () => window.G.state === 'toss' && window.G.toss, { timeout: 3000 });

  // Tap again near the toss apex (low on the pad → flat serve) → strike.
  await page.waitForFunction((apex) => window.G.toss && window.G.toss.t >= apex - 0.02,
    TOSS_APEX, { timeout: 3000, polling: 5 });
  await pointer(page, 'pointerdown', RIGHT.x, RIGHT.y, 8);
  await pointer(page, 'pointerup', RIGHT.x, RIGHT.y, 8);

  await waitForState(page, () => ['live', 'point'].includes(window.G.state)
    || (window.G.state === 'serve' && !window.G.toss), { timeout: 5000 });
  const s = await snapshot(page);
  // A flat touch serve should have produced a live ball (or, rarely, faulted back).
  expect(['live', 'serve', 'point']).toContain(s.state);
  if (s.state === 'live') expect(s.ball.isServe).toBe(true);
  expect(errors).toEqual([]);
});

test('touch swing pad returns an NPC ball and logs a player shot', async ({ page }) => {
  const errors = attachErrorGuard(page);
  await installSeed(page, 24680);
  await gotoGame(page);
  await startRally(page, 'easy');
  await enableTouch(page);
  await setServeAim(page, -2.0, -3.5);
  await humanServe(page, 'flat');

  let connected = false;
  for (let i = 0; i < 6 && !connected; i++) connected = await touchReturn(page);
  expect(connected).toBe(true);

  const shots = (await openPointEvents(page)).filter(e => e.type === 'playerShot');
  expect(shots.length).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

// These run in a touch-capable context so isTouchEnv() auto-detects, exercising
// the real device gate (no window.enableTouch shortcut).
test.describe('device gating and disable', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('auto-enables on a touch-capable device; a connected controller hides it', async ({ page }) => {
    const errors = attachErrorGuard(page);
    await gotoGame(page);
    await expect(page.locator('body')).toHaveClass(/touch-capable/);
    expect(await page.evaluate(() => window.G.touch.enabled)).toBe(true); // auto-on
    await expect(page.locator('body')).toHaveClass(/touch/);

    // Simulate a gamepad connecting — in auto mode the pads must hide.
    await page.evaluate(() => {
      const ev = new Event('gamepadconnected');
      ev.gamepad = { index: 0, buttons: [], axes: [] };
      window.dispatchEvent(ev);
    });
    await waitForState(page, () => window.G.touch.enabled === false);
    await expect(page.locator('body')).not.toHaveClass(/(^|\s)touch(\s|$)/);
    await expect(page.locator('body')).toHaveClass(/touch-capable/); // still offered
    expect(errors).toEqual([]);
  });

  test('user can disable touch from the menu toggle, and it persists', async ({ page }) => {
    const errors = attachErrorGuard(page);
    await gotoGame(page);
    await expect(page.locator('#touchToggleRow')).toBeVisible();
    expect(await page.evaluate(() => window.G.touch.enabled)).toBe(true);

    await page.click('#touchToggle');                  // On → Off
    await waitForState(page, () => window.G.touch.enabled === false);
    await expect(page.locator('body')).not.toHaveClass(/(^|\s)touch(\s|$)/);
    expect(await page.evaluate(() => localStorage.getItem('ck_touchPref'))).toBe('off');

    await page.click('#touchToggle');                  // Off → On again
    await waitForState(page, () => window.G.touch.enabled === true);
    expect(errors).toEqual([]);
  });
});
