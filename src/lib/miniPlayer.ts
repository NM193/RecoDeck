/**
 * Open Mini Player as a separate floating window (Spotify-style).
 * Single-instance: if window exists, focus it; otherwise create it.
 */
export async function openMiniPlayer(): Promise<void> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

    const label = 'mini-player';
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
      return;
    }

    const baseUrl = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
    const url = `${baseUrl}#mini-player`;

    const webview = new WebviewWindow(label, {
      url,
      width: 340,
      height: 480,
      resizable: true,
      decorations: true,
      alwaysOnTop: true,
      title: 'RecoDeck Mini Player',
    });

    webview.once('tauri://error', (e: { payload?: string }) => {
      console.error('[MiniPlayer] Window creation failed:', e?.payload ?? e);
    });
    webview.once('tauri://created', () => {
      console.log('[MiniPlayer] Window created successfully');
    });
  } catch (err) {
    console.error('[MiniPlayer] Failed to open:', err);
    throw err;
  }
}
