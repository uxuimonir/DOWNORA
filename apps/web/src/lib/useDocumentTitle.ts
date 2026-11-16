import { useEffect } from 'react';

/** Gives every screen its own browser/tab title (WCAG 2.4.2). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} – Downora` : 'Downora — One click. Any supported media.';
  }, [title]);
}
