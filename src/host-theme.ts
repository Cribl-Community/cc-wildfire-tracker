export type HostTheme = 'light' | 'dark';

/**
 * Applies the Cribl shell's theme to this document. The shell posts `CRIBL_APP_LAYOUT` shortly after
 * load and again on every toggle; `@capra/theme` keys its dark tokens off a `.dark` class on body.
 * Returns a teardown fn.
 */
export function installThemeBridge(onTheme?: (theme: HostTheme) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent) return; // any frame can post to yours
    const data = event.data as { type?: string; theme?: HostTheme } | null;
    if (data?.type !== 'CRIBL_APP_LAYOUT') return;
    if (data.theme !== 'light' && data.theme !== 'dark') return;
    document.body.classList.toggle('dark', data.theme === 'dark');
    onTheme?.(data.theme);
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/** First-paint guess only; the shell's postMessage is the source of truth. */
export function initialTheme(): HostTheme {
  if (document.body.classList.contains('dark')) return 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
