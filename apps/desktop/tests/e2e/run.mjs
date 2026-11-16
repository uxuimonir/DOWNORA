// End-to-end tests for the real Downora desktop app.
//
// Launches the built app (target/debug/downora-desktop, built with
// `tauri build --debug --no-bundle`) through tauri-driver + WebKitWebDriver on
// a virtual X display, with a throw-away HOME, then drives the UI with plain
// W3C WebDriver calls. Media comes from the extension's fixture server.
//
// Linux only (tauri-driver has no macOS support; on Windows it needs
// msedgedriver). Run: pnpm --filter @downora/desktop e2e

import { spawn, execFileSync } from 'node:child_process';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BIN = join(ROOT, 'target/debug/downora-desktop');
const SAMPLES = join(ROOT, '../web/public/samples');
const FIXTURES = join(ROOT, '../extension/tests/fixtures/server.mjs');
const MEDIA = 'http://localhost:4600';
const BRIDGE = 47995;
const DRIVER = 'http://127.0.0.1:4444';
const HOME = mkdtempSync(join(tmpdir(), 'downora-e2e-'));
const DOWNLOADS = join(HOME, 'Downloads/Downora');
const SHOTS = process.env.DOWNORA_E2E_SHOTS;
const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

if (!existsSync(BIN)) {
  console.error(`Build the app first: npx tauri build --debug --no-bundle  (missing ${BIN})`);
  process.exit(2);
}

const children = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function start(cmd, args, env = {}) {
  const env2 = { ...process.env, ...env };
  for (const k of Object.keys(env2)) if (k.startsWith('XDG_')) delete env2[k];
  const c = spawn(cmd, args, { env: env2, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(c);
  return c;
}
function cleanup() {
  for (const c of children.reverse()) c.kill('SIGTERM');
}
process.on('exit', cleanup);

// ───────────────────────── WebDriver ─────────────────────────

let sid;
async function wd(method, path, body) {
  const res = await fetch(`${DRIVER}${path.replace(':sid', sid)}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json.value ?? json).slice(0, 300)}`);
  return json.value;
}
const ELEM = 'element-6066-11e4-a52e-4f735466cecf';
const $x = async (xpath) => (await wd('POST', '/session/:sid/element', { using: 'xpath', value: xpath }))[ELEM];
const $$x = async (xpath) => (await wd('POST', '/session/:sid/elements', { using: 'xpath', value: xpath })).map((e) => e[ELEM]);
const click = (id) => wd('POST', `/session/:sid/element/${id}/click`, {});
const type = (id, text) => wd('POST', `/session/:sid/element/${id}/value`, { text });
const text = (id) => wd('GET', `/session/:sid/element/${id}/text`);
const attr = (id, name) => wd('GET', `/session/:sid/element/${id}/attribute/${name}`);
const run = (script, ...args) => wd('POST', '/session/:sid/execute/sync', { script, args });
const bodyText = () => run('return document.body.innerText');

async function waitFor(what, fn, timeout = 20000, every = 100) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(every);
  }
  throw new Error(`Timed out waiting for ${what}${last ? ` (${last.message})` : ''}`);
}
const waitText = (t, timeout) => waitFor(`text "${t}"`, async () => (await bodyText()).includes(t), timeout);
const button = (label) => `//button[normalize-space(.)='${label}' or @aria-label='${label}']`;
const nav = async (label) => click(await $x(`//nav//button[starts-with(normalize-space(.),'${label}')]`));
async function shot(name) {
  if (!SHOTS) return;
  const png = await wd('GET', '/session/:sid/screenshot');
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(png, 'base64'));
}

// ───────────────────────── helpers ─────────────────────────

const sample = (n) => readFileSync(join(SAMPLES, n));
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
async function jobStatus(fileStart) {
  return run(
    `const el=[...document.querySelectorAll('[data-testid="job"]')].find(e=>e.innerText.includes(arguments[0]));return el?el.dataset.status:null`,
    fileStart,
  );
}
async function addDownload(url) {
  await nav('Downloader');
  const field = await $x("//input[@placeholder='https://example.com/media/clip.mp4']");
  await wd('POST', `/session/:sid/element/${field}/clear`, {});
  await type(field, url);
  await click(await $x(button('Analyze')));
  // Wait for the new analysis (the previous one may still be on screen).
  const dl = "//*[@data-testid='analysis']//button[starts-with(normalize-space(.),'Download ')]";
  await click(await waitFor('analysis', async () => ((await $$x(dl))[0]), 20000));
}

function bridgeRequest(method, path, { body = '', origin = EXT, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: BRIDGE, method, path, headers: { origin, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...headers } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}
function signed(method, path, body, keyId, secret, tweak = {}) {
  const ts = String(Date.now());
  const nonce = tweak.nonce ?? randomBytes(16).toString('hex');
  const canon = `${method}\n${path}\n${ts}\n${nonce}\n${createHash('sha256').update(body).digest('hex')}`;
  const sig = createHmac('sha256', tweak.secret ?? secret).update(canon).digest('hex');
  return bridgeRequest(method, path, { body, headers: { 'x-downora-key': keyId, 'x-downora-timestamp': ts, 'x-downora-nonce': nonce, 'x-downora-signature': sig } });
}

// ───────────────────────── tests ─────────────────────────

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('app starts and shows the overview', async () => {
  await waitText('Overview', 30000);
  const t = await bodyText();
  assert(/TOTAL DOWNLOADS/i.test(t) && /AVAILABLE STORAGE/i.test(t), 'overview stats missing');
  await shot('01-overview');
});

test('offline / unreachable link shows a clear error', async () => {
  await nav('Downloader');
  const field = await $x("//input[@placeholder='https://example.com/media/clip.mp4']");
  await wd('POST', `/session/:sid/element/${field}/clear`, {});
  await type(field, 'http://127.0.0.1:9/clip.mp4');
  await click(await $x(button('Analyze')));
  await waitText('Couldn’t reach the server');
});

test('download with real progress saves the exact file', async () => {
  await addDownload(`${MEDIA}/media/downora-sample-1080p.mp4?rate=150000`);
  const seen = new Set();
  await waitFor('completion', async () => {
    const t = await run(`return document.querySelector('[data-testid="inline-progress"]')?.innerText ?? ''`);
    const pct = t.match(/(\d+)%/);
    if (pct) seen.add(Number(pct[1]));
    return t.startsWith('Saved');
  }, 30000, 150);
  assert([...seen].some((p) => p > 0 && p < 100), `no intermediate progress seen: ${[...seen]}`);
  await shot('02-downloaded');
  const file = join(DOWNLOADS, 'downora sample 1080p.mp4');
  assert(existsSync(file), 'file not saved');
  assert(readFileSync(file).equals(sample('downora-sample-1080p.mp4')), 'saved bytes differ');
});

test('pause and resume in the queue', async () => {
  await addDownload(`${MEDIA}/media/downora-sample-720p.webm?rate=40000`);
  await nav('Download Queue');
  await waitFor('downloading', async () => (await jobStatus('downora sample 720p')) === 'downloading', 40000);
  await sleep(1200);
  await click(await $x(`//*[@data-testid='job' and contains(.,'downora sample 720p')]//button[normalize-space(.)='Pause']`));
  await waitFor('paused', async () => (await jobStatus('downora sample 720p')) === 'paused');
  const part = readdirSync(DOWNLOADS).find((f) => f.endsWith('.downora-part'));
  assert(part, 'partial file kept while paused');
  const held = statSync(join(DOWNLOADS, part)).size;
  await sleep(600);
  assert(statSync(join(DOWNLOADS, part)).size === held, 'nothing written while paused');
  await shot('03-paused');
  await click(await $x(`//*[@data-testid='job' and contains(.,'downora sample 720p')]//button[normalize-space(.)='Resume']`));
  await nav('History');
  await waitFor('completed', async () => (await jobStatus('downora sample 720p')) === 'completed', 30000);
  assert(readFileSync(join(DOWNLOADS, 'downora sample 720p.webm')).equals(sample('downora-sample-720p.webm')), 'resumed file differs');
});

test('cancel removes the download and its partial file', async () => {
  await addDownload(`${MEDIA}/media/downora-sample-tone.wav?rate=30000`);
  await nav('Download Queue');
  await waitFor('downloading', async () => (await jobStatus('downora sample tone.wav')) === 'downloading');
  await click(await $x(`//*[@data-testid='job' and contains(.,'downora sample tone.wav')]//button[normalize-space(.)='Cancel']`));
  await nav('History');
  await waitFor('canceled', async () => (await jobStatus('downora sample tone.wav')) === 'canceled');
  assert(!readdirSync(DOWNLOADS).some((f) => f.endsWith('.downora-part')), 'partial file left behind');
});

test('a dropped connection fails, and Retry tries again', async () => {
  await addDownload(`${MEDIA}/broken/downora-sample-1080p.mp4`);
  await nav('History');
  await waitFor('failed', async () => (await jobStatus('downora sample 1080p.mp4') === 'failed') || null, 20000);
  const failed = await $x(`//*[@data-testid='job' and @data-status='failed']`);
  assert(/dropped|stopped|Only/.test(await text(failed)), 'failure reason shown');
  await click(await $x(`//*[@data-testid='job' and @data-status='failed']//button[normalize-space(.)='Retry']`));
  await waitFor('retry started', async () => (await $$x(`//*[@data-testid='job' and @data-status='failed']`)).length === 0 || (await $$x(`//*[@data-testid='job' and (@data-status='downloading' or @data-status='queued')]`)).length > 0, 5000, 30);
});

test('convert a download to MP3, then confirm before replacing', async () => {
  await nav('History');
  await click(await $x(`//*[@data-testid='job' and @data-status='completed' and contains(.,'downora sample 1080p.mp4')]//button[normalize-space(.)='Convert']`));
  await waitText('h264');
  await click(await $x(`//button[@role='radio' and normalize-space(.)='MP3']`));
  await click(await $x(`//button[starts-with(normalize-space(.),'Convert 1 to MP3')]`));
  await waitFor('conversion done', async () => (await $$x(`//*[@data-testid='conversion' and @data-status='completed']`)).length === 1, 60000);
  const out = join(DOWNLOADS, 'downora sample 1080p.mp3');
  assert(existsSync(out), 'mp3 written next to the download');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', out]).toString());
  assert(probe.streams.length === 1 && probe.streams[0].codec_type === 'audio', 'audio only');
  await shot('04-converted');

  await click(await $x(`//button[starts-with(normalize-space(.),'Convert 1 to MP3')]`));
  await waitText('Replace the existing file?');
  await shot('05-confirm-replace');
  await click(await $x(`//*[@role='alertdialog']//button[normalize-space(.)='Replace']`));
  await waitFor('second conversion', async () => (await $$x(`//*[@data-testid='conversion' and @data-status='completed']`)).length === 2, 60000);
  assert(readFileSync(join(DOWNLOADS, 'downora sample 1080p.mp4')).equals(sample('downora-sample-1080p.mp4')), 'original untouched');
});

test('browser pairing needs approval, then signed jobs download', async () => {
  // Before pairing: rejected.
  assert((await bridgeRequest('POST', '/v1/status')).status === 401, 'unpaired request must fail');
  await nav('Browser Integration');
  await click(await $x(button('Pair a browser')));
  const code = await text(await waitFor('code', () => $x("//*[@data-testid='pair-code']")));
  assert(/^\d{6}$/.test(code), `code ${code}`);
  await shot('06-pair-code');
  const pairing = bridgeRequest('POST', '/v1/pair', { body: JSON.stringify({ code, clientName: 'Chrome' }) });
  await waitText('Allow Chrome to send downloads?');
  await shot('07-approve');
  await click(await $x(`//*[@role='alertdialog']//button[normalize-space(.)='Allow']`));
  const res = await pairing;
  assert(res.status === 200 && res.json.secret, `pairing failed: ${JSON.stringify(res)}`);
  const secret = Buffer.from(res.json.secret, 'base64');
  await waitFor('paired browser listed', async () => (await $$x("//*[@data-testid='paired-browser']")).length === 1);

  assert((await signed('POST', '/v1/status', '', res.json.keyId, secret, { secret: Buffer.from('wrong') })).status === 401, 'bad signature must fail');
  const nonce = randomBytes(16).toString('hex');
  assert((await signed('POST', '/v1/status', '', res.json.keyId, secret, { nonce })).status === 200, 'signed status');
  assert((await signed('POST', '/v1/status', '', res.json.keyId, secret, { nonce })).status === 401, 'replay must fail');

  const body = JSON.stringify({ url: `${MEDIA}/media/downora-sample-tone.mp3`, title: 'Podcast from Chrome', container: 'mp3' });
  const job = await signed('POST', '/v1/jobs', body, res.json.keyId, secret);
  assert(job.status === 201, `job ${JSON.stringify(job)}`);
  await waitText('Browser connected');
  await nav('History');
  await waitFor('browser job saved', async () => (await jobStatus('Podcast from Chrome.mp3')) === 'completed', 20000);
  assert(readFileSync(join(DOWNLOADS, 'Podcast from Chrome.mp3')).equals(sample('downora-sample-tone.mp3')), 'browser job bytes');
  await shot('08-history');
});

test('settings are saved to disk', async () => {
  await nav('Settings');
  await click(await $x(`//*[@aria-label='Downloads at once']//button[normalize-space(.)='4']`));
  const file = join(HOME, '.config/app.downora.desktop/settings.json');
  await waitFor('settings file', () => existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).concurrency === 4);
  await shot('09-settings');
});

// ───────────────────────── main ─────────────────────────

(async () => {
  start('Xvfb', [':98', '-screen', '0', '1440x900x24']);
  start('node', [FIXTURES]);
  start('tauri-driver', ['--port', '4444'], { DISPLAY: ':98', HOME, DOWNORA_BRIDGE_PORT: String(BRIDGE), NO_AT_BRIDGE: '1' });
  await waitFor('tauri-driver', async () => (await fetch(`${DRIVER}/status`).catch(() => null))?.ok, 20000);
  await waitFor('fixture server', async () => (await fetch(`${MEDIA}/pages/single.html`).catch(() => null))?.ok, 10000);
  const session = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'tauri:options': { application: BIN } } } });
  sid = session.sessionId;

  let failed = 0;
  for (const t of tests) {
    const t0 = Date.now();
    try {
      await t.fn();
      console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`);
    } catch (e) {
      failed += 1;
      console.log(`  ✘ ${t.name}\n      ${e.message}`);
      await shot(`fail-${tests.indexOf(t)}`).catch(() => {});
    }
  }
  await wd('DELETE', '/session/:sid').catch(() => {});
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  cleanup();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});
