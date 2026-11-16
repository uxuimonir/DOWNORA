// Extension ⇄ Downora Desktop, against the real Rust bridge
// (apps/desktop/crates/core/src/bin/downora-bridge-dev.rs).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, fab, ORIGIN, test } from './fixtures';

const BIN = fileURLToPath(new URL('../../../desktop/target/debug/downora-bridge-dev', import.meta.url));
const SAMPLE = fileURLToPath(new URL('../../../web/public/samples/downora-sample-1080p.mp4', import.meta.url));

class DesktopDev {
  proc: ChildProcessWithoutNullStreams;
  lines: Record<string, unknown>[] = [];
  data = mkdtempSync(join(tmpdir(), 'downora-desktop-'));
  constructor() {
    this.proc = spawn(BIN, ['--port', '47913', '--data', this.data]);
    let buf = '';
    this.proc.stdout.on('data', (c: Buffer) => {
      buf += c.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const l = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          this.lines.push(JSON.parse(l));
        } catch {
          /* ignore */
        }
      }
    });
  }
  async waitFor(pred: (l: Record<string, unknown>) => boolean, ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const hit = this.lines.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('desktop event not seen');
  }
  send(cmd: string) {
    this.proc.stdin.write(`${cmd}\n`);
  }
  stop() {
    this.proc.kill();
  }
}

test.skip(!existsSync(BIN), 'Build the bridge first: cargo build -p downora-core --bin downora-bridge-dev (in apps/desktop)');

test.beforeEach(async ({ enableSite }) => {
  await enableSite();
});

test('pairs with Downora Desktop, hands off a real download, falls back to Chrome when it stops', async ({ context, sw, extensionId }) => {
  const desktop = new DesktopDev();
  try {
    await desktop.waitFor((l) => l.type === 'ready');

    // Popup → Settings → Desktop app → enter the code shown "in the app".
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('radio', { name: 'Settings' }).click();
    await expect(popup.getByTestId('desktop-section')).toContainText('Pair a browser');

    desktop.send('pair');
    const { code } = (await desktop.waitFor((l) => l.type === 'code')) as { code: string };
    // A wrong code is refused by the app.
    await popup.getByLabel('Pairing code').fill(code === '000000' ? '111111' : '000000');
    await popup.getByRole('button', { name: 'Pair' }).click();
    await expect(popup.getByRole('alert')).toContainText('isn’t right');

    desktop.send('approve-next');
    await popup.getByLabel('Pairing code').fill(code);
    await popup.getByRole('button', { name: 'Pair' }).click();
    await expect(popup.getByTestId('desktop-section')).toContainText('Paired with Downora Desktop', { timeout: 15000 });
    await expect(popup.getByTestId('desktop-section')).toContainText('Connected');
    const pairReq = await desktop.waitFor((l) => l.type === 'pairRequest');
    expect(pairReq.origin).toBe(`chrome-extension://${extensionId}`);

    // The secret lives in the extension's IndexedDB, not in chrome.storage.
    const inStorage = await sw.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null)) + JSON.stringify(await chrome.storage.sync.get(null)));
    expect(inStorage).not.toContain('secret');

    // Download from the in-page panel: the desktop app saves it.
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/pages/single.html`);
    await fab(page).click();
    await page.getByRole('button', { name: 'Download video' }).click();
    await expect(page.getByRole('dialog')).toContainText('Saved by Downora Desktop', { timeout: 20000 });
    const saved = join(desktop.data, 'Downloads', 'Launch film.mp4');
    await expect.poll(() => existsSync(saved)).toBe(true);
    expect(readFileSync(saved).equals(readFileSync(SAMPLE))).toBe(true);
    expect(await sw.evaluate(() => chrome.downloads.search({}).then((l) => l.length))).toBe(0); // Chrome didn't download it

    // Desktop app quits: the next download falls back to Chrome, with a note.
    desktop.stop();
    await page.keyboard.press('Escape');
    await fab(page).click();
    await page.getByRole('button', { name: 'Download video' }).click();
    await expect(page.getByRole('dialog')).toContainText('Saved to your Downloads folder', { timeout: 20000 });
    await popup.reload();
    await popup.getByRole('radio', { name: /^Downloads/ }).click();
    await expect(popup.getByText('Chrome saved this file instead')).toBeVisible();
    await expect(popup.getByText('Saved by Downora Desktop')).toBeVisible();
    await popup.getByRole('radio', { name: 'Settings' }).click();
    await expect(popup.getByTestId('desktop-section')).toContainText('Offline');
  } finally {
    desktop.stop();
  }
});

test('a pairing the user denies in the app stores nothing', async ({ context, extensionId, sw }) => {
  const desktop = new DesktopDev();
  try {
    await desktop.waitFor((l) => l.type === 'ready');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('radio', { name: 'Settings' }).click();
    desktop.send('pair');
    const { code } = (await desktop.waitFor((l) => l.type === 'code')) as { code: string };
    desktop.send('deny-next');
    await popup.getByLabel('Pairing code').fill(code);
    await popup.getByRole('button', { name: 'Pair' }).click();
    await expect(popup.getByRole('alert')).toContainText('wasn’t approved');
    const state = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'desktop/state' }));
    expect(state).toEqual({ ok: true, data: { paired: false, reachable: null } });
    void sw;
  } finally {
    desktop.stop();
  }
});
