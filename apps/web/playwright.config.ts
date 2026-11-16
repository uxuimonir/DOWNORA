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
    { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true },
    { command: 'node tests/fixtures/media-server.mjs', url: 'http://localhost:4599/page.html', reuseExistingServer: true },
  ],
});
