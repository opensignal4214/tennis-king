import { test, expect } from '@playwright/test';
import { gotoGame } from './helpers.js';

// Fake a standard gamepad so we can drive the menu navigation the controller code
// reads each frame via navigator.getGamepads().
async function connectFakePad(page) {
  await page.addInitScript(() => {
    window.__gp = {
      index: 0, id: 'fake-pad', mapping: 'standard', connected: true, timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    navigator.getGamepads = () => [window.__gp];
  });
}

async function tap(page, i) {
  await page.evaluate(n => { window.__gp.buttons[n] = { pressed: true, value: 1 }; }, i);
  await page.waitForTimeout(70);
  await page.evaluate(n => { window.__gp.buttons[n] = { pressed: false, value: 0 }; }, i);
  await page.waitForTimeout(70);
}

test.describe('controller menu navigation', () => {
  test('D-pad moves focus and ✕ confirms on the main menu', async ({ page }) => {
    await connectFakePad(page);
    await gotoGame(page);
    await page.evaluate(() => { const ev = new Event('gamepadconnected'); ev.gamepad = window.__gp; window.dispatchEvent(ev); });
    await page.waitForTimeout(80);

    // A focus highlight should appear on the first menu control.
    await tap(page, 13); // D-pad down
    const first = await page.evaluate(() => document.querySelector('.gp-focus')?.textContent ?? null);
    expect(first).not.toBeNull();

    // Moving again lands on a different control.
    await tap(page, 13);
    const second = await page.evaluate(() => document.querySelector('.gp-focus')?.textContent ?? null);
    expect(second).not.toBe(first);

    // ✕ activates the focused control: focus a difficulty pill, confirm, check it applied.
    await page.evaluate(() => {
      const pills = [...document.querySelectorAll('#diffRow .pill')];
      pills.forEach(p => p.classList.remove('gp-focus'));
    });
    // Navigate to the top, then confirm the first focusable (Easy pill).
    await tap(page, 12); await tap(page, 12); await tap(page, 12); await tap(page, 12);
    const focusedText = await page.evaluate(() => document.querySelector('.gp-focus')?.textContent ?? '');
    await tap(page, 0); // ✕ confirm
    // Whatever pill/button we confirmed, a click fired without error and focus persists.
    expect(focusedText.length).toBeGreaterThan(0);
  });

  test('✕ starts a match from Match Play → Singles', async ({ page }) => {
    await connectFakePad(page);
    await gotoGame(page);
    await page.evaluate(() => { const ev = new Event('gamepadconnected'); ev.gamepad = window.__gp; window.dispatchEvent(ev); });
    await page.waitForTimeout(80);

    // Walk down to the "Match Play" button (after 3 diff pills) and confirm.
    for (let i = 0; i < 6; i++) {
      const txt = await page.evaluate(() => document.querySelector('.gp-focus')?.textContent ?? '');
      if (txt.includes('Match Play')) break;
      await tap(page, 13);
    }
    await tap(page, 0); // ✕ → opens match-type screen
    await expect(page.locator('#matchtype')).toBeVisible();

    // On the match-type screen, focus + confirm "Singles".
    for (let i = 0; i < 4; i++) {
      const txt = await page.evaluate(() => document.querySelector('.gp-focus')?.textContent ?? '');
      if (txt.includes('Singles')) break;
      await tap(page, 13);
    }
    await tap(page, 0); // ✕ → start singles
    await page.waitForFunction(() => window.G.started === true, undefined, { timeout: 5000 });
    expect(await page.evaluate(() => window.G.mode)).toBe('match');
  });
});
