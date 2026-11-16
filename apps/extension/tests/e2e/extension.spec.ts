import AxeBuilder from '@axe-core/playwright';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatBytes } from '../../src/content/overlay';
import { expect, fab, ORIGIN, OTHER_ORIGIN, test } from './fixtures';

const sample = (name: string) => statSync(fileURLToPath(new URL(`../../../web/public/samples/${name}`, import.meta.url))).size;
const MP4 = sample('downora-sample-1080p.mp4');

test.beforeEach(async ({ enableSite }) => {
  await enableSite();
});

test('single video: button placement, real details, download saves every byte', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/single.html`);
  await expect(fab(page)).toHaveCount(1);

  const v = (await page.locator('video').boundingBox())!;
  const b = (await fab(page).boundingBox())!;
  expect(b.x + b.width).toBeLessThanOrEqual(v.x + v.width); // inside the player…
  expect(b.x).toBeGreaterThan(v.x + v.width - 60); // …at the right edge
  expect(b.y).toBeLessThan(v.y + 20); // …at the top
  expect(b.y + b.height).toBeLessThan(v.y + v.height - 60); // clear of the bottom control bar

  await fab(page).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText('Launch film');
  await expect(panel).toContainText('localhost:4600');
  await expect(panel).toContainText('1920 × 1080');
  await expect(panel.getByRole('radio')).toHaveCount(1);
  await expect(panel).toContainText('1080p');
  await expect(panel).toContainText(formatBytes(MP4));
  await expect(panel).not.toContainText('4K');

  await panel.getByRole('button', { name: 'Download video' }).click();
  await expect(panel).toContainText('Saved to your Downloads folder', { timeout: 15_000 });
  const items = await sw.evaluate(() => chrome.downloads.search({ state: 'complete' }));
  expect(items).toHaveLength(1);
  expect(items[0]!.bytesReceived).toBe(MP4);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(fab(page)).toBeFocused();
});

test('multiple media: one button per real player, tiny previews skipped, stated qualities only', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/multiple.html`);
  await expect(fab(page)).toHaveCount(3); // 2 videos + 1 audio; the 120×68 preview is ignored
  await expect(page.getByRole('button', { name: 'Download with Downora: Tiny preview' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Download with Downora: Two qualities' }).click();
  const panel = page.getByRole('dialog');
  const radios = panel.getByRole('radio');
  await expect(radios).toHaveCount(2);
  await expect(panel.locator('label.opt').nth(0)).toContainText('MP41080p');
  await expect(panel.locator('label.opt').nth(1)).toContainText('WEBM720p');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Download with Downora: Podcast episode' }).click();
  await expect(panel.getByRole('button', { name: 'Download audio' })).toBeVisible();
  await expect(panel).toContainText('MP3');
});

test('dynamic players: appear late, follow resizes, no duplicates, removed with the player', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/dynamic.html`);
  await page.waitForTimeout(600);
  await expect(fab(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Load video' }).click();
  await expect(fab(page)).toHaveCount(1);
  const before = (await fab(page).boundingBox())!;

  await page.getByRole('button', { name: 'Make bigger' }).click();
  await expect.poll(async () => (await fab(page).boundingBox())!.x).toBeGreaterThan(before.x + 300);

  await page.getByRole('button', { name: 'Change source' }).click();
  await page.waitForTimeout(800);
  await expect(fab(page)).toHaveCount(1);
  await expect(page.locator('downora-overlay')).toHaveCount(1);

  await page.getByRole('button', { name: 'Remove video' }).click();
  await expect(fab(page)).toHaveCount(0);
});

test('button follows the page on scroll and hides off-screen', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/single.html`);
  const v0 = (await page.locator('video').boundingBox())!;
  expect(Math.round((await fab(page).boundingBox())!.y)).toBe(Math.round(v0.y + 10));
  // Video moves up 30 px: the button moves with it.
  await page.mouse.wheel(0, 30);
  await expect.poll(async () => Math.round((await fab(page).boundingBox())!.y)).toBe(Math.round(v0.y - 30 + 10));
  // Video's top scrolls out of view: the button stays pinned inside the visible part.
  await page.mouse.wheel(0, 150);
  await expect.poll(async () => Math.round((await fab(page).boundingBox())!.y)).toBe(10);
  await page.mouse.wheel(0, 800);
  await expect(fab(page)).toBeHidden();
});

test('unsupported media (blob/MSE, HLS, MKV) gets no button and an honest popup message', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/unsupported.html`);
  await page.waitForTimeout(1500);
  await expect(fab(page)).toHaveCount(0);
  const popup = await openPopup(page);
  await expect(popup.getByText('No supported media found')).toBeVisible();
});

test('page CSS cannot hide or restyle the button (Shadow DOM)', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/hostile.html`);
  await expect(fab(page)).toBeVisible();
  await fab(page).click();
  await expect(page.getByRole('button', { name: 'Download video' })).toBeVisible();
  const color = await page.getByRole('button', { name: 'Download video' }).evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe('rgb(0, 255, 0)');
});

test('a file the server refuses is explained and cannot be downloaded', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/refused.html`);
  await fab(page).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('alert')).toContainText('can’t be downloaded');
  await expect(panel).toContainText('error 403');
  await expect(panel.getByRole('button', { name: 'Download video' })).toBeDisabled();
});

test('progress is real, and a dropped connection fails with Retry in the popup', async ({ context, sw, openPopup }) => {
  const slow = await context.newPage();
  await slow.goto(`${ORIGIN}/pages/slow.html`);
  await fab(slow).click();
  await slow.getByRole('button', { name: 'Download video' }).click();
  const bar = slow.getByRole('progressbar');
  await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 10_000 }).toBeGreaterThan(5);
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);
  await expect(slow.getByRole('dialog')).toContainText('Saved', { timeout: 20_000 });

  const broken = await context.newPage();
  await broken.goto(`${ORIGIN}/pages/broken.html`);
  await fab(broken).click();
  await broken.getByRole('button', { name: 'Download video' }).click();
  await expect(broken.getByRole('dialog')).toContainText('Download failed', { timeout: 20_000 });

  const popup = await openPopup(broken);
  await popup.getByRole('radio', { name: /Downloads/ }).click();
  const failed = popup.locator('[data-testid="popup-download"][data-state="interrupted"]');
  await expect(failed).toHaveCount(1);
  await failed.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => sw.evaluate(() => chrome.downloads.search({}).then((l) => l.length))).toBe(3);
});

test('popup: lists page media, downloads from the list, opens the dashboard', async ({ context, sw, openPopup }) => {
  await sw.evaluate((url) => chrome.storage.sync.set({ settings: { dashboardUrl: url } }), `${ORIGIN}/dash`);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/multiple.html`);
  await expect(fab(page)).toHaveCount(3);
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, page.url());
  expect(await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('3');

  const popup = await openPopup(page);
  await expect(popup.getByText('Detection is on for this site.')).toBeVisible();
  await expect(popup.getByTestId('popup-media')).toHaveCount(3);
  await popup.getByRole('button', { name: 'Download Product tour' }).click();
  await expect(popup.locator('[data-testid="popup-download"][data-state="complete"]')).toHaveCount(1, { timeout: 15_000 });

  const opened = context.waitForEvent('page');
  await popup.getByRole('button', { name: 'Dashboard' }).click();
  expect((await opened).url()).toBe(`${ORIGIN}/dash/dashboard`);

  // "Open in Downora" from the in-page panel hands the file to the web app.
  await page.bringToFront();
  await page.getByRole('button', { name: 'Download with Downora: Product tour' }).click();
  const fromPanel = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open in Downora' }).click();
  expect((await fromPanel).url()).toBe(`${ORIGIN}/dash/video?url=${encodeURIComponent(`${ORIGIN}/media/downora-sample-1080p.mp4`)}`);
});

test('settings: hiding the floating button applies to open pages', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/single.html`);
  await expect(fab(page)).toBeVisible();
  const popup = await openPopup(page);
  await popup.getByRole('radio', { name: 'Settings' }).click();
  await popup.getByRole('switch', { name: 'Show button on videos' }).click();
  await expect(fab(page)).toBeHidden();
  await popup.getByRole('switch', { name: 'Show button on videos' }).click();
  await expect(fab(page)).toBeVisible();
});

test('permission failures: no access means no script, no buttons, and a clear message', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto(`${OTHER_ORIGIN}/pages/single.html`);
  await page.waitForTimeout(1000);
  await expect(fab(page)).toHaveCount(0);

  const popup = await openPopup(page);
  await expect(popup.getByText(/^Detection is off/)).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Turn on for this site' })).toHaveCount(0); // address hidden without access
  await popup.getByRole('button', { name: 'Scan once' }).click();
  await expect(popup.getByRole('alert')).toContainText('didn’t let Downora read this page');

  const res = await popup.evaluate((origin) => chrome.runtime.sendMessage({ type: 'site/enabled', origin }), OTHER_ORIGIN);
  expect(res).toEqual({ ok: false, error: 'Permission wasn’t granted, so Downora stays off for this site.' });
});

test('API states: not configured, server error, unreachable', async ({ context, sw, openPopup }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/single.html`);
  const popup = await openPopup(page);
  await popup.getByRole('radio', { name: 'Settings' }).click();
  await expect(popup.getByText('No Downora API is set.')).toBeVisible();

  const apiField = popup.getByLabel(/Downora API address/);
  await apiField.fill(`${ORIGIN}/badapi`);
  await popup.getByRole('button', { name: 'Save addresses' }).click();
  await expect(popup.getByText('The API answered with error 500.')).toBeVisible();

  await apiField.fill('http://localhost:4699');
  await popup.getByRole('button', { name: 'Save addresses' }).click();
  await expect(popup.getByText('Couldn’t reach the API.')).toBeVisible();
  expect(await sw.evaluate(() => chrome.storage.sync.get('settings').then((s) => (s.settings as { apiUrl: string }).apiUrl))).toBe('http://localhost:4699');
});

test('security: pages cannot message the extension, and bad requests are rejected', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/single.html`);
  const reachable = await page.evaluate((id) => {
    const c = (globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }).chrome;
    try {
      return typeof c?.runtime?.sendMessage === 'function' ? 'api-present' : 'no-api';
    } catch {
      return 'no-api';
    }
  }, extensionId);
  expect(reachable).toBe('no-api'); // no externally_connectable in the manifest

  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  const bad = [
    { type: 'download/start', request: { url: 'blob:http://localhost:4600/x', title: 'x', container: 'mp4', kind: 'video' } },
    { type: 'download/start', request: { url: 'javascript:alert(1)', title: 'x', container: 'mp4', kind: 'video' } },
    { type: 'download/start', request: { url: `${ORIGIN}/payload.exe`, title: 'x', container: 'mp4', kind: 'video' } },
    { type: 'site/enabled', origin: 'chrome://settings' },
    { type: 'tab/state', tabId: 'one' },
    { type: 'eval', code: '1' },
  ];
  for (const msg of bad) {
    expect(await ext.evaluate((m) => chrome.runtime.sendMessage(m), msg)).toEqual({ ok: false, error: 'Rejected message.' });
  }
});

test('popup and in-page panel pass an accessibility scan', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/multiple.html`);
  await expect(fab(page)).toHaveCount(3);
  await fab(page).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const panelScan = await new AxeBuilder({ page }).include('downora-overlay').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(panelScan.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

  const popup = await openPopup(page);
  for (const tab of ['This page', 'Downloads', 'Settings']) {
    await popup.getByRole('radio', { name: new RegExp(`^${tab}`) }).click();
    await popup.waitForTimeout(300);
    const r = await new AxeBuilder({ page: popup }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa', 'best-practice']).analyze();
    expect(r.violations.map((v) => `${tab} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }
});

test('account: sign in from the popup, finished downloads reach the shared history', async ({ context, openPopup }) => {
  const API = 'http://localhost:8787';
  const email = `ext-${Date.now()}@example.com`;
  const password = 'correct horse battery';
  const reg = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify({ email, password }),
  });
  expect(reg.status).toBe(201);

  const page = await context.newPage();
  await page.goto(`${ORIGIN}/pages/multiple.html`);
  const popup = await openPopup(page);
  await popup.getByRole('radio', { name: 'Settings' }).click();
  await popup.getByLabel(/Downora API address/).fill(API);
  await popup.getByRole('button', { name: 'Save addresses' }).click();

  await popup.getByLabel('Email').fill(email);
  await popup.getByLabel('Password').fill('wrong password!!');
  await popup.getByRole('button', { name: 'Sign in' }).click();
  await expect(popup.getByRole('alert')).toBeVisible();
  await popup.getByLabel('Password').fill(password);
  await popup.getByRole('button', { name: 'Sign in' }).click();
  await expect(popup.getByTestId('ext-account-email')).toHaveText(email);

  // Theme switch applies to the popup.
  await popup.getByRole('radio', { name: 'Light theme' }).click();
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'light');

  await popup.getByRole('radio', { name: 'This page' }).click();
  await popup.getByRole('button', { name: 'Download Product tour' }).click();
  await expect(popup.locator('[data-testid="popup-download"][data-state="complete"]')).toHaveCount(1, { timeout: 15_000 });

  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify({ email, password, client: 'extension' }),
  });
  const { token } = (await login.json()) as { token: string };
  await expect
    .poll(async () => {
      const r = await fetch(`${API}/api/history`, { headers: { authorization: `Bearer ${token}` } });
      const j = (await r.json()) as { items?: { source: string; title: string }[] };
      return (j.items ?? []).map((e) => `${e.source}:${e.title}`);
    })
    .toContain('extension:Product tour');

  // Sign out clears the session.
  await popup.getByRole('radio', { name: 'Settings' }).click();
  await popup.getByRole('button', { name: 'Sign out' }).click();
  await expect(popup.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
