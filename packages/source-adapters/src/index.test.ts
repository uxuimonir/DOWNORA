import { describe, expect, it } from 'vitest';
import {
  describeAdapters,
  extensionOf,
  matchMime,
  matchUrl,
  namesFromPath,
  qualityLabelFor,
  sanitizeFileName,
  validateMediaUrl,
} from './index';

describe('validateMediaUrl', () => {
  it('accepts http and https links', () => {
    expect(validateMediaUrl('https://cdn.example.com/a.mp4').ok).toBe(true);
    expect(validateMediaUrl('http://cdn.example.com/a.mp4').ok).toBe(true);
  });

  it('assumes https when the scheme is missing', () => {
    const result = validateMediaUrl('  cdn.example.com/clip.webm ');
    expect(result.ok && result.url.href).toBe('https://cdn.example.com/clip.webm');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['ftp://example.com/a.mp4', 'unsupported_scheme'],
    ['javascript:alert(1)', 'unsupported_scheme'],
    ['file:///etc/passwd', 'unsupported_scheme'],
    ['data:video/mp4;base64,AAAA', 'unsupported_scheme'],
    ['https://user:secret@example.com/a.mp4', 'credentials_in_url'],
    ['https://', 'malformed'],
    ['not a link', 'malformed'],
    ['clip', 'malformed'],
  ])('rejects %j as %s', (input, reason) => {
    const result = validateMediaUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it('allows localhost for development', () => {
    expect(validateMediaUrl('http://localhost:4599/a.mp4').ok).toBe(true);
  });
});

describe('adapter matching', () => {
  it('matches direct video by extension, ignoring query strings and case', () => {
    expect(matchUrl(new URL('https://a.example/v/Clip.MP4?token=1'))).toMatchObject({
      adapterId: 'direct-video',
      container: 'mp4',
      kind: 'video',
    });
    expect(matchUrl(new URL('https://a.example/clip.webm#t=3'))?.container).toBe('webm');
  });

  it('matches direct audio by extension', () => {
    expect(matchUrl(new URL('https://a.example/s.mp3'))).toMatchObject({
      adapterId: 'direct-audio',
      container: 'mp3',
      kind: 'audio',
    });
    expect(matchUrl(new URL('https://a.example/s.m4a'))?.container).toBe('m4a');
    expect(matchUrl(new URL('https://a.example/s.wav'))?.container).toBe('wav');
  });

  it('does not claim pages, playlists or unsupported containers', () => {
    expect(matchUrl(new URL('https://video.example/watch?v=abc'))).toBeNull();
    expect(matchUrl(new URL('https://a.example/stream.m3u8'))).toBeNull();
    expect(matchUrl(new URL('https://a.example/movie.mkv'))).toBeNull();
    expect(matchUrl(new URL('https://a.example/.mp4'))).toBeNull();
  });

  it('matches by MIME type with parameters', () => {
    expect(matchMime('video/mp4; codecs="avc1.42E01E"')?.container).toBe('mp4');
    expect(matchMime('Audio/MPEG')?.container).toBe('mp3');
    expect(matchMime('text/html; charset=utf-8')).toBeNull();
    expect(matchMime('application/vnd.apple.mpegurl')).toBeNull();
  });

  it('exposes serializable descriptors without functions', () => {
    const descriptors = describeAdapters();
    expect(descriptors.map((d) => d.id)).toEqual(['direct-video', 'direct-audio', 'local-file']);
    expect(JSON.parse(JSON.stringify(descriptors))).toEqual(descriptors);
  });
});

describe('qualityLabelFor', () => {
  it.each([
    [7680, 4320, '8K'],
    [3840, 2160, '4K'],
    [2560, 1440, '2K'],
    [1920, 1080, '1080p'],
    [1280, 720, '720p'],
    [854, 480, '480p'],
    [640, 360, '360p'],
    [1080, 1920, '1080p'],
    [1920, 1072, '1080p'],
  ])('%i×%i → %s', (w, h, label) => {
    expect(qualityLabelFor(w, h)).toBe(label);
  });
});

describe('file names', () => {
  it('reads extensions', () => {
    expect(extensionOf(new URL('https://a.example/a/b/c.tar.MP4'))).toBe('mp4');
    expect(extensionOf(new URL('https://a.example/a/b/'))).toBeNull();
  });

  it('derives a title and safe base name from the path', () => {
    expect(namesFromPath('/media/launch-day_final%20cut.mp4')).toEqual({
      title: 'launch day final cut',
      baseName: 'launch-day_final cut',
    });
    expect(namesFromPath('/')).toEqual({ title: 'Untitled media', baseName: 'download' });
  });

  it('strips characters that are invalid on disk', () => {
    expect(sanitizeFileName('  a<b>:c"/d\\e|f?g*.  ')).toBe('abcdefg');
  });
});
