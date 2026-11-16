import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatBytes } from '../../src/lib/format';

const MEDIA = 'http://localhost:4599';
const sampleSize = (name: string) =>
  statSync(fileURLToPath(new URL(`../../public/samples/${name}`, import.meta.url))).size;

async function analyze(page: Page, url: string) {
  await page.getByRole('textbox', { name: 'Media link' }).fill(url);
  await page.getByRole('button', { name: 'Analyze' }).click();
}

test('analyzes a bundled sample and saves the exact file', async ({ page }) => {
  await page.goto('/video');
  await page.getByRole('button', { name: '1080p MP4' }).click();

  const stage = page.getByTestId('media-stage');
  await expect(stage).toBeVisible();
  await expect(stage.getByText('1920 × 1080').first()).toBeVisible();
  await expect(stage.getByText('0:08')).toBeVisible();
  await expect(stage.getByText('1080p').first()).toBeVisible();
  await expect(stage.getByRole('img', { name: /Preview frame/ })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await stage.getByRole('button', { name: /Download MP4/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('downora-sample-1080p.mp4');
  const saved = await download.path();
  expect(statSync(saved).size).toBe(sampleSize('downora-sample-1080p.mp4'));

  await expect(page.getByTestId('download-complete')).toContainText('Saved downora-sample-1080p.mp4');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).click();
  await expect(page.getByTestId('job-row').first()).toHaveAttribute('data-status', 'completed');
});

test('shows real progress, pauses, and resumes from the same byte', async ({ page }) => {
  await page.goto('/video');
  // ~490 KB at 60 KB/s ≈ 8 s, slow enough to observe and pause.
  await analyze(page, `${MEDIA}/cors/downora-sample-1080p.mp4?rate=60000`);
  const stage = page.getByTestId('media-stage');
  await expect(stage.getByText(formatBytes(sampleSize('downora-sample-1080p.mp4'))).first()).toBeVisible();

  const downloadPromise = page.waitForEvent('download', { timeout: 45_000 });
  await stage.getByRole('button', { name: /Download MP4/ }).click();
  const bar = page.getByTestId('download-progress').getByRole('progressbar');
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 10_000 }).toBeGreaterThan(5);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Queue/ }).click();
  const row = page.getByTestId('job-row').first();
  await row.getByRole('button', { name: 'Pause' }).click();
  await expect(row).toHaveAttribute('data-status', 'paused');
  const pausedAt = Number(await row.getByRole('progressbar').getAttribute('aria-valuenow'));
  expect(pausedAt).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  expect(Number(await row.getByRole('progressbar').getAttribute('aria-valuenow'))).toBe(pausedAt);

  await row.getByRole('button', { name: 'Resume' }).click();
  const download = await downloadPromise;
  expect(statSync(await download.path()).size).toBe(sampleSize('downora-sample-1080p.mp4'));
  await expect(page.getByText('Nothing in the queue')).toBeVisible();
});

test('cancels a running download', async ({ page }) => {
  await page.goto('/audio');
  await analyze(page, `${MEDIA}/cors/downora-sample-tone.wav?rate=30000`);
  await page.getByTestId('media-stage').getByRole('button', { name: /Download WAV/ }).click();
  await page.getByTestId('download-progress').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Download canceled')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('download-progress')).toBeVisible();
});

test('explains every error state honestly', async ({ page }) => {
  await page.goto('/video');

  await analyze(page, 'ftp://example.com/a.mp4');
  await expect(page.getByRole('alert')).toContainText('Only http and https links are supported.');

  await analyze(page, `${MEDIA}/cors/missing.mp4`);
  await expect(page.getByRole('alert')).toContainText('error 404');

  await analyze(page, `${MEDIA}/page.html`);
  await expect(page.getByRole('alert')).toContainText('opens a web page');

  await analyze(page, 'https://video.example.com/watch?v=abc');
  await expect(page.getByRole('alert')).toContainText('doesn’t recognise this link');
});

test('falls back to opening the file when the server blocks browser reads', async ({ page }) => {
  await page.goto('/video');
  await analyze(page, `${MEDIA}/nocors/downora-sample-720p.webm`);
  const stage = page.getByTestId('media-stage');
  await expect(stage.getByText('1280 × 720').first()).toBeVisible();
  await expect(stage.getByText('doesn’t let browsers read the file directly')).toBeVisible();
  await expect(stage.getByRole('link', { name: 'Open the file in a new tab instead' })).toHaveAttribute(
    'href',
    `${MEDIA}/nocors/downora-sample-720p.webm`,
  );
  // Signed out, the server route is locked rather than pretending to work.
  await expect(stage.getByRole('button', { name: /Download WEBM/ })).toBeDisabled();
});

test('settings persist and change file naming', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('combobox', { name: 'File names' }).click();
  await page.getByRole('option', { name: 'Name with quality' }).click();
  await expect(page.getByText('launch-trailer-1080p.mp4')).toBeVisible();
  await page.reload();
  await expect(page.getByText('launch-trailer-1080p.mp4')).toBeVisible();

  await page.goto('/video');
  await page.getByRole('button', { name: '720p WebM' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('media-stage').getByRole('button', { name: /Download WEBM/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('downora-sample-720p-720p.webm');
});

test('history search, filter and clear', async ({ page }) => {
  await page.goto('/audio');
  await page.getByRole('button', { name: 'MP3' }).click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('media-stage').getByRole('button', { name: /Download MP3/ }).click();
  await dl;

  await page.goto('/history');
  await expect(page.getByTestId('job-row')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Video' }).click();
  await expect(page.getByText('No matches')).toBeVisible();
  await page.getByRole('radio', { name: 'All types' }).click();
  await page.getByLabel('Search history').fill('tone');
  await expect(page.getByTestId('job-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear history' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear history' }).click();
  await expect(page.getByText('No downloads yet')).toBeVisible();
});

test('help center search filters articles', async ({ page }) => {
  await page.goto('/help');
  await page.getByLabel('Search help articles').fill('resume');
  await expect(page.getByText('Why does Resume sometimes start over?')).toBeVisible();
  await expect(page.getByText('Where do my files go?')).toHaveCount(0);
});

test('mobile navigation drawer works @mobile', async ({ page }) => {
  await page.goto('/dashboard');
  // iOS-style tab bar, with the rest of the app behind "More".
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Queue' }).click();
  await expect(page.getByRole('heading', { name: 'Queue', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Supported sources' }).click();
  await expect(page.getByRole('heading', { name: 'Supported sources', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const route of ['/', '/dashboard', '/video', '/queue', '/history', '/sources', '/settings', '/profile', '/sign-in', '/help']) {
  test(`no serious accessibility violations on ${route} @responsive`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    const serious = results.violations; // every impact level, not only serious
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('whole download flow works with the keyboard only', async ({ page }) => {
  await page.goto('/video');
  const field = page.getByRole('textbox', { name: 'Media link' });
  await expect(field).toBeFocused();
  await page.keyboard.type(`${MEDIA}/cors/downora-sample-720p.webm`);
  await page.keyboard.press('Enter');
  const download = page.getByRole('button', { name: /Download WEBM/ });
  await expect(download).toBeVisible();
  // Tab until the download button has focus — proves it is reachable and focus is visible.
  for (let i = 0; i < 40 && !(await download.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(download).toBeFocused();
  const outline = await download.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  const saved = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await saved).suggestedFilename()).toBe('downora-sample-720p.webm');
});

test('every screen has its own document title', async ({ page }) => {
  const titles = new Set<string>();
  for (const route of ['/', '/dashboard', '/video', '/audio', '/queue', '/history', '/sources', '/settings', '/profile', '/sign-in', '/help', '/nope']) {
    await page.goto(route);
    await expect(page).toHaveTitle(/Downora/);
    titles.add(await page.title());
  }
  expect(titles.size).toBe(12);
});

test('stays accessible with Increase Contrast and Reduce Motion @responsive', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce', colorScheme: 'light' });
  for (const route of ['/', '/settings', '/history']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    // Theme follows the OS by default: light here.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(247, 248, 252)');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  }
});

test('large title collapses into the nav bar on scroll @mobile', async ({ page }) => {
  await page.goto('/help');
  const barTitle = page.locator('header p', { hasText: 'Help center' });
  await expect(barTitle).toHaveCSS('opacity', '0');
  await page.mouse.wheel(0, 400);
  await expect(barTitle).toHaveCSS('opacity', '1');
});
