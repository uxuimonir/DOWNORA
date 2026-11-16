// Renders the Downora mark to the PNG sizes Chrome needs.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LOGO_SVG } from '../src/content/styles.ts';

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${LOGO_SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: `${out}icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
