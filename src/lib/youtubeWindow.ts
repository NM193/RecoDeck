/**
 * Opens a set in its own RecoDeck window, pointed at the real youtube.com page.
 *
 * This is not an embed. The M0 spike established that embedding is a dead end
 * twice over — a tauri:// page has no Referer so YouTube answers with error
 * 153, and most DJ sets refuse embedded playback anywhere regardless (see
 * PROGRESS.md, 2026-09-07). A window loading the normal watch page is just a
 * browser looking at YouTube, so none of that applies.
 *
 * Single-instance: a second click navigates the existing window instead of
 * opening another one, so the set does not end up playing twice.
 */

const LABEL = 'youtube'

/**
 * The player page, served by RecoDeck's own HTTP server.
 *
 * The video cannot be loaded into the panel directly. A page on a custom scheme
 * sends no Referer, and a top-level navigation to youtube.com/embed sends none
 * either, so the player answers with error 153 both ways — measured, twice.
 * What works is what an ordinary browser does: an iframe on a page served over
 * http, which carries a Referer. That page is `/yt-player`, served by the
 * companion server the app already runs.
 */
export function playerPageUrl(port: number, videoId: string, cueMs = 0): string {
  const seconds = Math.floor(cueMs / 1000)
  // localhost, never 127.0.0.1: YouTube accepts the first as an embedding
  // origin and answers the second with error 150. Same server, same port —
  // measured, and it costs an hour to rediscover.
  return `http://localhost:${port}/yt-player?v=${encodeURIComponent(videoId)}&t=${seconds}`
}

export function watchUrl(videoUrl: string, cueMs = 0): string {
  const seconds = Math.floor(cueMs / 1000)
  const separator = videoUrl.includes('?') ? '&' : '?'
  return seconds > 0 ? `${videoUrl}${separator}t=${seconds}s` : videoUrl
}

export async function openInAppWindow(videoUrl: string, cueMs = 0, title?: string): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const url = watchUrl(videoUrl, cueMs)

  const existing = await WebviewWindow.getByLabel(LABEL)
  if (existing) {
    // Navigating rather than recreating keeps one window and one audio source.
    await existing.close()
  }

  const webview = new WebviewWindow(LABEL, {
    url,
    width: 960,
    height: 600,
    resizable: true,
    title: title ? `${title} — YouTube` : 'YouTube',
  })

  webview.once('tauri://error', (e: { payload?: string }) => {
    console.error('[YouTube window] failed to open:', e?.payload ?? e)
  })
}
