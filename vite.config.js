import { defineConfig } from 'vite';

export default defineConfig({
  base: '/tennis-king/',
  server: {
    // Playwright e2e writes large JSON logs / artifacts into these dirs; without
    // ignoring them the dev-server file watcher churns and can drop connections
    // mid-run. They contain no app source, so ignoring them is safe.
    watch: { ignored: ['**/test-results/**', '**/playwright-report/**'] },
  },
});
