import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'off' },
  webServer: [
    { command: 'node tests/fixtures/server.mjs', url: 'http://localhost:4600/pages/single.html', reuseExistingServer: true },
    {
      // Real API for the account test (shared with the web app).
      command: 'pnpm --filter @downora/api start',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
      env: { ALLOW_PRIVATE_HOSTS: 'localhost', CORS_ORIGINS: 'http://localhost:5173', DATA_DIR: '/tmp/downora-e2e-api', RATE_LIMIT_PER_MINUTE: '100000' },
    },
  ],
});
