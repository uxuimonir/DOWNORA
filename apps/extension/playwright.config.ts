import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'off' },
  webServer: {
    command: 'node tests/fixtures/server.mjs',
    url: 'http://localhost:4600/pages/single.html',
    reuseExistingServer: true,
  },
});
