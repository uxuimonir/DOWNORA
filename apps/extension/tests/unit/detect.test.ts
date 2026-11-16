import { beforeEach, describe, expect, it } from 'vitest';
import { describe as describeMedia, elementId, sourcesOf, watch } from '../../src/content/detect';

const BASE = 'https://site.example/watch/page.html';

function video(html: string): HTMLVideoElement {
  document.body.innerHTML = html;
  return document.querySelector('video, audio') as HTMLVideoElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('sourcesOf', () => {
  it('reads src and <source> children, resolving relative URLs', () => {
    const el = video(`<video src="/media/clip.mp4"><source src="clip-720.webm" type="video/webm" size="720"></video>`);
    const s = sourcesOf(el, BASE);
    expect(s.map((x) => x.src)).toEqual(['https://site.example/watch/clip-720.webm', 'https://site.example/media/clip.mp4']);
    expect(s[0]).toMatchObject({ container: 'webm', height: 720 });
    expect(s[1]).toMatchObject({ container: 'mp4', height: undefined });
  });

  it('uses the type attribute when the URL has no extension', () => {
    const el = video(`<video><source src="https://cdn.example/stream?id=4" type="video/mp4"></video>`);
    expect(sourcesOf(el, BASE)).toHaveLength(1);
  });

  it('skips blob, data, MediaSource, playlists and unsupported containers', () => {
    const el = video(`<video src="blob:https://site.example/abc">
      <source src="data:video/mp4;base64,AAAA" type="video/mp4">
      <source src="/hls/master.m3u8" type="application/x-mpegURL">
      <source src="/movie.mkv">
      <source src="/movie.mov" type="video/quicktime">
    </video>`);
    expect(sourcesOf(el, BASE)).toEqual([]);
    expect(describeMedia(el, BASE)).toBeNull();
  });

  it('never invents a resolution', () => {
    const el = video(`<video><source src="/a.mp4"><source src="/b.mp4" label="HD"></video>`);
    expect(sourcesOf(el, BASE).every((s) => s.height === undefined)).toBe(true);
  });

  it('de-duplicates the same file listed twice', () => {
    const el = video(`<video src="/a.mp4"><source src="https://site.example/a.mp4"></video>`);
    expect(sourcesOf(el, BASE)).toHaveLength(1);
  });

  it('detects audio elements', () => {
    const el = video(`<audio src="/podcast/episode-12.mp3" aria-label="Episode 12"></audio>`);
    expect(describeMedia(el, BASE)).toMatchObject({ kind: 'audio', title: 'Episode 12' });
  });
});

describe('describe', () => {
  it('prefers explicit labels and keeps a stable id per element', () => {
    const el = video(`<figure><video src="/a.mp4" poster="/p.jpg"></video><figcaption>Launch film</figcaption></figure>`);
    const a = describeMedia(el, BASE)!;
    expect(a.title).toBe('Launch film');
    expect(a.poster).toBe('https://site.example/p.jpg');
    expect(elementId(el)).toBe(a.elementId);
    expect(describeMedia(el, BASE)!.elementId).toBe(a.elementId);
  });

  it('falls back to the file name for a title', () => {
    const el = video(`<video src="/media/product_tour-v2.mp4"></video>`);
    expect(describeMedia(el, BASE)!.title).toBe('product tour v2');
  });
});

describe('watch', () => {
  it('reports again when a player is added later, and only when something changed', async () => {
    // happy-dom has no layout; pretend every player is big enough.
    const rect = { width: 640, height: 360, top: 0, left: 0, right: 640, bottom: 360, x: 0, y: 0, toJSON() {} };
    HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;
    const calls: number[] = [];
    const stop = watch((d) => calls.push(d.length));
    expect(calls).toEqual([0]);
    const v = document.createElement('video');
    v.src = 'https://cdn.example/late.mp4';
    document.body.append(v);
    await new Promise((r) => setTimeout(r, 400));
    expect(calls).toEqual([0, 1]);
    document.body.append(document.createElement('div')); // unrelated change
    await new Promise((r) => setTimeout(r, 400));
    expect(calls).toEqual([0, 1]);
    v.remove();
    await new Promise((r) => setTimeout(r, 400));
    expect(calls).toEqual([0, 1, 0]);
    stop();
  });
});
