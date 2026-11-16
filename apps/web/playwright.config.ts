import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'off', acceptDownloads: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@responsive|@mobile/ },
  ],
  webServer: [
    { command: 'VITE_DOWNORA_API_URL=http://localhost:8787 pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true },
    {
      // Real API; dev-only allowlist lets it read the local sample/fixture servers.
      command: 'pnpm --filter @downora/api start',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
      env: { ALLOW_PRIVATE_HOSTS: 'localhost', CORS_ORIGINS: 'http://localhost:5173', DATA_DIR: '/tmp/downora-e2e-api', RATE_LIMIT_PER_MINUTE: '100000' },
    },
    { command: 'node tests/fixtures/media-server.mjs', url: 'http://localhost:4599/page.html', reuseExistingServer: true },
  ],
});
