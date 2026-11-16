import { sanitizeFileName } from '@downora/source-adapters';
import type { Container } from '@downora/types';

/** Windows refuses these as file names, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Safe relative file name for chrome.downloads: no path separators, no
 * control characters, no reserved names, sensible length.
 */
export function downloadFileName(title: string, container: Container): string {
  let base = sanitizeFileName(title.replace(/[\\/]+/g, ' ')).replace(/\.+$/, '');
  if (!base || RESERVED.test(base)) base = `downora-${base || 'media'}`;
  base = base.slice(0, 100).trim();
  return `${base}.${container}`;
}
