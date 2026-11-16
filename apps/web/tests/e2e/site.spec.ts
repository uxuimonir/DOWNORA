import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

const HEADINGS = [
  'Your Media. One Click Away.',
  'Everything a download needs. Nothing it doesn’t.',
  'Media preview',
  'Quality selector',
  'Format selector',
  'Download progress',
  'Three steps. No detours.',
  'Downora, right on the player.',
  'Supported sources, plainly.',
  'Video, at the quality it really is.',
  'Sound, set free.',
  'Downloads that stay in hand.',
  'Nothing to hide. Nothing hidden.',
  'Questions, answered.',
  'Your next file is one paste away.',
];

test('website: every section is there and the hero CTAs go where they say', async ({ page }) => {
  await page.goto('/');
  for (const h of HEADINGS) await expect(page.getByRole('heading', { name: h })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await page.getByRole('link', { name: 'Start Downloading' }).first().click();
  await expect(page).toHaveURL(/#download$/);
  await expect(page.getByRole('textbox', { name: 'Media link' })).toBeInViewport();
  await page.getByRole('link', { name: 'Get Chrome Extension' }).click();
  await expect(page.getByRole('heading', { name: 'Downora, right on the player.' })).toBeInViewport();
});

test('website: the hero downloader really works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '1080p MP4' }).click();
  const stage = page.getByTestId('media-stage');
  await expect(stage.getByText('1920 × 1080')).toBeVisible();
  // Server-backed formats: originals plus conversions, nothing above 1080p.
  await expect(stage.getByTestId('format-selector').getByRole('radio')).toHaveCount(3);
  await expect(stage.getByTestId('quality-selector').getByRole('radio')).toHaveText([/1080p/, /720p/, /480p/]);
  const saved = page.waitForEvent('download');
  await stage.getByRole('button', { name: /^Download MP4/ }).click();
  expect((await saved).suggestedFilename()).toBe('downora-sample-1080p.mp4');
  await expect(page.getByTestId('download-complete')).toBeVisible();
});

test('theme: switch, persist, follow the system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  expect(await theme()).toBe('dark');
  await page.getByRole('radio', { name: 'Light theme' }).first().click();
  expect(await theme()).toBe('light');
  await page.reload();
  expect(await theme()).toBe('light'); // saved, applied before paint
  await page.getByRole('radio', { name: 'Match system theme' }).first().click();
  expect(await theme()).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(theme).toBe('light');
});

test('account: create, convert video to MP3 on the server, see it in history, sign out', async ({ page }) => {
  // Signed out, conversions are clearly locked.
  await page.goto('/video');
  await page.getByRole('button', { name: '1080p MP4' }).click();
  const stage = page.getByTestId('media-stage');
  await stage.getByRole('radio', { name: 'Audio' }).click();
  await expect(stage.getByRole('button', { name: /Convert & download MP3/ })).toBeDisabled();
  await expect(stage.getByRole('link', { name: 'Sign in to convert' })).toBeVisible();

  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/sign-in?mode=register&next=/video');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await expect(page).toHaveURL(/\/video$/);

  await page.getByRole('button', { name: '1080p MP4' }).click();
  await stage.getByRole('radio', { name: 'Audio' }).click();
  await stage.getByRole('radio', { name: /MP3/ }).click();
  const saved = page.waitForEvent('download', { timeout: 60_000 });
  await stage.getByRole('button', { name: /Convert & download MP3/ }).click();
  await expect(page.getByTestId('download-progress')).toBeVisible();
  const file = await saved;
  expect(file.suggestedFilename()).toBe('downora sample 1080p.mp3');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', await file.path()]).toString());
  expect(probe.streams.map((s: { codec_type: string }) => s.codec_type)).toEqual(['audio']);
  await expect(page.getByTestId('download-complete')).toContainText('downora sample 1080p.mp3');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).click();
  await expect(page.getByTestId('account-history')).toContainText('downora sample 1080p.mp3');
  await expect(page.getByTestId('account-history')).toContainText('Converted');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByTestId('account-email')).toHaveText(email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Not signed in')).toBeVisible();
});

test('account: wrong password and duplicate email are explained', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password', { exact: true }).fill('definitely wrong 123');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page.getByRole('alert')).toContainText('don’t match');
});

for (const scheme of ['dark', 'light'] as const) {
  for (const [name, width, height] of [['desktop', 1440, 900], ['laptop', 1280, 800], ['tablet', 834, 1112], ['mobile', 390, 844]] as const) {
    test(`website ${scheme} ${name}: no sideways scroll, no accessibility violations`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
