import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const EXT = fileURLToPath(new URL('../../dist-test', import.meta.url));
export const ORIGIN = 'http://localhost:4600';
/** Same server, different origin — the test build has no permission for it. */
export const OTHER_ORIGIN = 'http://127.0.0.1:4600';

type Fixtures = {
  context: BrowserContext;
  sw: Worker;
  extensionId: string;
  /** Turns detection on for the fixture origin, as "Turn on for this site" does. */
  enableSite: () => Promise<void>;
  /** The popup UI for a given tab, opened as a page. */
  openPopup: (tab: Page) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      acceptDownloads: true,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(context);
    await context.close();
  },
  sw: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(sw);
  },
  extensionId: async ({ sw }, use) => use(sw.url().split('/')[2]!),
  enableSite: async ({ context, extensionId }, use) => {
    await use(async () => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      const res = await page.evaluate((origin) => chrome.runtime.sendMessage({ type: 'site/enabled', origin }), ORIGIN);
      if (!res?.ok) throw new Error(`enable failed: ${JSON.stringify(res)}`);
      await page.close();
    });
  },
  openPopup: async ({ context, extensionId, sw }, use) => {
    await use(async (tab) => {
      await tab.bringToFront();
      // The active tab — querying by URL only works where the extension has access.
      const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id);
      const popup = await context.newPage();
      await popup.setViewportSize({ width: 380, height: 600 });
      await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
      return popup;
    });
  },
});

export const expect = test.expect;

export const fab = (page: Page) => page.getByRole('button', { name: /^Download with Downora/ });
