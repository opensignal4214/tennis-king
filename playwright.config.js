import { defineConfig, devices } from '@playwright/test';

// E2E suite for Court King. Drives the game through the real vite dev server,
// scripts serves via keyboard, and asserts against window.LOGGER / window state.
export default defineConfig({
  testDir: './test/e2e',
  // Game logic is timing/RAF sensitive — keep runs serial and deterministic.
  fullyParallel: false,
  workers: 1,
  // Rally tests drive a real-time loop via keyboard; allow one retry to absorb
  // occasional timing jitter under load (trace is captured on the retry).
  retries: 1,
  timeout: 30_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173/tennis-king/',
    viewport: { width: 960, height: 600 },
    // Video/full-trace capture is CPU-heavy and competes with the real-time game
    // loop, which destabilises timing-sensitive rally tests. Keep it light.
    trace: 'on-first-retry',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Serve the *built* app (no dev-server file watcher / HMR). This is stable and
    // deterministic for the real-time rally tests and immune to concurrent source
    // edits churning the server. Rebuild to pick up code changes (it builds here).
    command: 'npm run build && npx vite preview --port 5173 --strictPort',
    url: 'http://localhost:5173/tennis-king/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
