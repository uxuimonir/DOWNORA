// Builds the extension into dist/ (or dist-test/ with --test).
//   popup.html + assets  — React popup (Vite, ES modules)
//   background.js        — service worker (ES module, one file)
//   content.js           — content script (IIFE, one file: content scripts can't import)
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const test = process.argv.includes('--test');
const outDir = `${root}${test ? 'dist-test' : 'dist'}`;
const alias = { '@': `${root}src` };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const common = { configFile: false, logLevel: 'warn', resolve: { alias }, define: { 'process.env.NODE_ENV': '"production"' } };

await build({
  ...common,
  root: `${root}src/popup`,
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir, emptyOutDir: false, target: 'chrome121', rollupOptions: { input: `${root}src/popup/popup.html` } },
});

for (const [entry, format, name] of [
  ['src/background/index.ts', 'es', 'background'],
  ['src/content/index.ts', 'iife', 'content'],
]) {
  await build({
    ...common,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome121',
      minify: true,
      lib: { entry: `${root}${entry}`, formats: [format], name: 'downora', fileName: () => `${name}.js` },
    },
  });
}

const manifest = JSON.parse(await readFile(`${root}src/manifest.json`, 'utf8'));
if (test) {
  // Test build only: pre-grant the local fixture server so the suite can run
  // without the permission prompt. Never shipped.
  manifest.host_permissions = ['http://localhost:4600/*', 'http://localhost:8787/*'];
  manifest.name = 'Downora (test build)';
}
await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
await cp(`${root}public/icons`, `${outDir}/icons`, { recursive: true });
console.log(`Built ${test ? 'test ' : ''}extension → ${outDir}`);
