import { test, expect } from '@playwright/test';
import { installSeed, gotoGame, startSinglesMatch, startRally,
         humanServe, waitForState, setServeAim } from './helpers.js';

// Phase 1+2 verification: matchStats is initialised on a match, stays null in
// rally mode, and accumulates points/serve data as points end.
test.describe('match stats accumulation', () => {
  test('singles match initialises and accumulates matchStats', async ({ page }) => {
    await installSeed(page);
    await gotoGame(page);
    await startSinglesMatch(page, 'medium');

    // Initialised as a fresh stats object.
    const init = await page.evaluate(() => window.G.matchStats);
    expect(init).not.toBeNull();
    expect(init.pointsWon).toEqual([0, 0]);
    expect(Array.isArray(init.players)).toBe(true);
    expect(init.players).toHaveLength(4);

    // Play out several points: serve, then let the rally resolve on its own.
    for (let i = 0; i < 6; i++) {
      const serving = await page.evaluate(
        () => window.G.state === 'serve' && window.G.serveT === Infinity);
      if (serving) {
        await setServeAim(page, -2.0, -4.6);
        await humanServe(page, 'flat');
      }
      // Wait for this point to finish (back to serve/point) and stats to tick.
      await waitForState(page,
        () => ['serve', 'point', 'over'].includes(window.G.state),
        { timeout: 12000 });
      await page.waitForTimeout(400);
      if (await page.evaluate(() => window.G.state === 'over')) break;
    }

    const S = await page.evaluate(() => window.G.matchStats);
    // At least some points were scored and tallied.
    expect(S.nPoints).toBeGreaterThan(0);
    expect(S.pointsWon[0] + S.pointsWon[1]).toBe(S.nPoints);
    // Serve attempts were recorded for at least one side.
    expect(S.firstTotal[0] + S.firstTotal[1]).toBeGreaterThan(0);
    // A serve speed was measured (m/s, real units).
    expect(S.fastServe[0] + S.fastServe[1]).toBeGreaterThan(0);
    // Live-strip km/h hook fired.
    expect(await page.evaluate(() => window.G._lastServeKmh)).toBeGreaterThan(0);
  });

  test('pause menu shows the stats panel + landing map', async ({ page }) => {
    await installSeed(page);
    await gotoGame(page);
    await startSinglesMatch(page, 'medium');

    // Play a couple of points so there is something to show.
    for (let i = 0; i < 2; i++) {
      if (await page.evaluate(() => window.G.state === 'serve' && window.G.serveT === Infinity)) {
        await setServeAim(page, -2.0, -4.6);
        await humanServe(page, 'flat');
      }
      await waitForState(page, () => ['serve', 'point', 'over'].includes(window.G.state), { timeout: 12000 });
      await page.waitForTimeout(300);
    }

    // Open the pause menu and reveal the dedicated stats screen.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#menu', { state: 'visible' });
    await expect(page.locator('#statsBtn')).toBeVisible();
    await page.click('#statsBtn');

    const screen = page.locator('#statsscreen');
    await expect(screen).toBeVisible();
    await expect(screen.locator('table.statgrid')).toHaveCount(1);
    await expect(screen.locator('#landmap')).toHaveCount(1);

    // Toggling to CPU redraws without error.
    await screen.locator('[data-lm="1"]').click();
    await expect(screen.locator('[data-lm="1"]')).toHaveClass(/sel/);

    // Back button returns to the main menu.
    await screen.locator('#statsBack').click();
    await expect(screen).toBeHidden();
    await expect(page.locator('#statsBtn')).toBeVisible();
  });

  test('live stats strip flashes after a point', async ({ page }) => {
    await installSeed(page);
    await gotoGame(page);
    await startSinglesMatch(page, 'medium');
    for (let i = 0; i < 8; i++) {
      if (await page.evaluate(() => window.G.state === 'serve' && window.G.serveT === Infinity)) {
        await setServeAim(page, -2.0, -4.6);
        await humanServe(page, 'flat');
      }
      await waitForState(page, () => ['serve', 'point', 'over'].includes(window.G.state), { timeout: 12000 });
      await page.waitForTimeout(200);
      if (await page.evaluate(() => window.G.matchStats.nPoints > 0)) break;
    }
    const html = await page.evaluate(() => document.getElementById('livestats').innerHTML);
    expect(html).toContain('Rally');
  });

  test('Tab opens and closes the stats screen (and pauses/resumes)', async ({ page }) => {
    await installSeed(page);
    await gotoGame(page);
    await startSinglesMatch(page, 'medium');
    await page.keyboard.press('Tab');
    await expect(page.locator('#statsscreen')).toBeVisible();
    expect(await page.evaluate(() => window.G.paused)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.locator('#statsscreen')).toBeHidden();
    expect(await page.evaluate(() => window.G.paused)).toBe(false);
  });

  test('Z toggles the on-court shot map', async ({ page }) => {
    await installSeed(page);
    await gotoGame(page);
    await startSinglesMatch(page, 'medium');
    expect(await page.evaluate(() => window.G.showLandings)).toBe(false);
    await page.keyboard.press('KeyZ');
    expect(await page.evaluate(() => window.G.showLandings)).toBe(true);
    await page.keyboard.press('KeyZ');
    expect(await page.evaluate(() => window.G.showLandings)).toBe(false);
  });

  test('rally mode leaves matchStats null', async ({ page }) => {
    await installSeed(page);
    await gotoGame(page);
    await startRally(page, 'medium');
    expect(await page.evaluate(() => window.G.matchStats)).toBeNull();
  });
});
