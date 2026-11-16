import type { DetectedMedia } from '@downora/types';
import { describe, expect, it } from 'vitest';
import { isSupportedMediaUrl, parseContentMessage, parsePopupMessage } from '../../src/shared/messages';

const media = (over: Partial<DetectedMedia> = {}): DetectedMedia => ({
  elementId: 'dm-1',
  kind: 'video',
  title: 'Clip',
  sources: [{ src: 'https://cdn.example.com/a.mp4', kind: 'video', container: 'mp4', current: true }],
  ...over,
});

describe('isSupportedMediaUrl', () => {
  it('accepts direct media files', () => {
    expect(isSupportedMediaUrl('https://cdn.example.com/a.mp4')).toBe(true);
    expect(isSupportedMediaUrl('http://cdn.example.com/a.webm?x=1')).toBe(true);
    expect(isSupportedMediaUrl('https://cdn.example.com/stream', 'audio/mpeg')).toBe(true);
  });
  it.each([
    'blob:https://example.com/123',
    'data:video/mp4;base64,AAAA',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://user:pw@cdn.example.com/a.mp4',
    'https://cdn.example.com/playlist.m3u8',
    'https://cdn.example.com/page.html',
  ])('rejects %s', (url) => expect(isSupportedMediaUrl(url)).toBe(false));
});

describe('parseContentMessage', () => {
  it('accepts a valid media update', () => {
    expect(parseContentMessage({ type: 'media/update', media: [media()] })).not.toBeNull();
  });
  it('rejects unknown types and malformed payloads', () => {
    expect(parseContentMessage({ type: 'nope' })).toBeNull();
    expect(parseContentMessage(null)).toBeNull();
    expect(parseContentMessage('media/update')).toBeNull();
    expect(parseContentMessage({ type: 'media/update', media: 'x' })).toBeNull();
    expect(parseContentMessage({ type: 'media/update', media: [media({ sources: [] })] })).toBeNull();
    expect(parseContentMessage({ type: 'media/update', media: [media({ kind: 'image' as never })] })).toBeNull();
    expect(parseContentMessage({ type: 'media/update', media: [media({ poster: 'javascript:alert(1)' })] })).toBeNull();
    expect(parseContentMessage({ type: 'media/update', media: Array.from({ length: 51 }, () => media()) })).toBeNull();
  });
  it('refuses downloads of unsupported or dangerous URLs', () => {
    const req = (url: string) => ({ type: 'download/start', request: { url, title: 'x', container: 'mp4', kind: 'video' } });
    expect(parseContentMessage(req('https://cdn.example.com/a.mp4'))).not.toBeNull();
    expect(parseContentMessage(req('blob:https://cdn.example.com/1'))).toBeNull();
    expect(parseContentMessage(req('https://cdn.example.com/a.exe'))).toBeNull();
    expect(parseContentMessage({ type: 'download/start', request: { url: 'https://cdn.example.com/a.mp4', title: 'x', container: 'exe', kind: 'video' } })).toBeNull();
  });
  it('validates probe and dashboard targets', () => {
    expect(parseContentMessage({ type: 'media/probe', url: 'https://cdn.example.com/a.mp3' })).not.toBeNull();
    expect(parseContentMessage({ type: 'media/probe', url: 'http://169.254.169.254/latest' })).toBeNull();
    expect(parseContentMessage({ type: 'dashboard/open', url: 'javascript:alert(1)' })).toBeNull();
  });
});

describe('parsePopupMessage', () => {
  it('accepts well-formed messages', () => {
    expect(parsePopupMessage({ type: 'tab/state', tabId: 3 })).toEqual({ type: 'tab/state', tabId: 3 });
    expect(parsePopupMessage({ type: 'site/enabled', origin: 'https://example.com' })).not.toBeNull();
    expect(parsePopupMessage({ type: 'site/enabled', origin: '*' })).not.toBeNull();
  });
  it('rejects bad ids and origins', () => {
    expect(parsePopupMessage({ type: 'tab/state', tabId: -1 })).toBeNull();
    expect(parsePopupMessage({ type: 'tab/state', tabId: '3' })).toBeNull();
    expect(parsePopupMessage({ type: 'site/enabled', origin: 'https://example.com/path' })).toBeNull();
    expect(parsePopupMessage({ type: 'site/enabled', origin: 'chrome://settings' })).toBeNull();
    expect(parsePopupMessage({ type: 'downloads/retry', id: 1.5 })).toBeNull();
  });
});
