// Share links: a link that opens one playlist (`?share=<token>`), never the library.
// The share token lives in sessionStorage only, never in localStorage, so it can
// never become the saved pairing (`companion_token`).

import { HttpStatusError } from '../src/lib/http-api'

/** sessionStorage key: keeps share mode across a reload in the same tab */
export const SHARE_SESSION_KEY = 'recodeck_share'

/** What the page's link can carry, as read from window.location and the server */
export interface ShareLinkSources {
  /** window.location.search */
  search: string
  /** window.location.hash */
  hash: string
  /** window.__RECODECK_SHARE__, injected by the companion server */
  injected?: unknown
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

/** The share token a link carries: from the query, else the hash, else the server-injected global */
export function shareFromLink({
  search,
  hash,
  injected,
}: ShareLinkSources): string | undefined {
  const fromQuery = nonEmpty(new URLSearchParams(search).get('share'))
  if (fromQuery) return fromQuery
  const fromHash = hash
    ? nonEmpty(
        new URLSearchParams(hash.replace(/^#/, '').replace(/^\?/, '')).get(
          'share',
        ),
      )
    : undefined
  if (fromHash) return fromHash
  return nonEmpty(injected)
}

/**
 * The share token this page runs with, if any. A share in the link wins; a link
 * with a companion token (pairing QR, old-style playlist link) is not share mode;
 * otherwise a share kept in this tab's session (a reload after the URL was stripped).
 */
export function pickShareToken(
  link: { share?: string; token?: string },
  sessionShare: string | null | undefined,
): string | undefined {
  if (link.share) return link.share
  if (link.token) return undefined
  return nonEmpty(sessionShare)
}

/** The companion token a link carries, for the pairing state: none in share mode */
export function linkPairingToken(
  link: { token?: string },
  shareToken: string | undefined,
): string | undefined {
  return shareToken ? undefined : link.token
}

/** What isReloadNavigation reads: window.performance, or a stand-in */
export interface NavigationTimingSource {
  getEntriesByType?: (type: string) => ReadonlyArray<object>
  /** Deprecated PerformanceNavigation: type 1 is a reload */
  navigation?: { type?: number }
}

/**
 * Whether this page load is a reload. Only a reload reuses the session's share
 * token, so opening the plain companion URL in the same tab leaves share mode.
 * Without the timing APIs it is not a reload.
 */
export function isReloadNavigation(
  perf: NavigationTimingSource | undefined,
): boolean {
  try {
    const entry = perf?.getEntriesByType?.('navigation')?.[0] as
      | { type?: unknown }
      | undefined
    if (entry && typeof entry.type === 'string') return entry.type === 'reload'
    return perf?.navigation?.type === 1
  } catch {
    return false
  }
}

/** Whether a token is shaped like one the desktop app makes: 64 lowercase hex characters */
export function isShareTokenShaped(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token)
}

/** A 401: the share link expired, was stopped, or never existed */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof HttpStatusError && err.status === 401
}

/**
 * Whether the share link is gone, by asking the server (e.g. GET /api/status).
 * Only a 401 says so; a network error or any other failure does not.
 */
export async function shareLinkGone(
  probe: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await probe()
    return false
  } catch (err) {
    return isUnauthorized(err)
  }
}

/** "Oct 23": the day a share link stops working, in local time */
export function formatShareUntil(expiresAtSeconds: number): string {
  return new Date(expiresAtSeconds * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** "1 track", "4 tracks" */
export function formatTrackCount(count: number): string {
  return `${count} ${count === 1 ? 'track' : 'tracks'}`
}

/** One track's length, "3:05", or "--:--" when it is not known */
export function formatTrackLength(ms?: number): string {
  if (!ms || ms <= 0) return '--:--'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * The playlist's total length, "2:10" or "1:02:05". Undefined when it is not
 * known: an empty list, or a track without a duration.
 */
export function formatTotalLength(
  tracks: ReadonlyArray<{ duration_ms?: number }>,
): string | undefined {
  if (tracks.length === 0) return undefined
  let totalMs = 0
  for (const track of tracks) {
    if (!track.duration_ms || track.duration_ms <= 0) return undefined
    totalMs += track.duration_ms
  }
  const totalSeconds = Math.floor(totalMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const ss = seconds.toString().padStart(2, '0')
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${ss}`
    : `${minutes}:${ss}`
}

/** This tab's share token (a reload stays in share mode). Storage can throw: then none. */
export function readSessionShare(): string | null {
  try {
    return sessionStorage.getItem(SHARE_SESSION_KEY)
  } catch {
    return null
  }
}

export function saveSessionShare(token: string): void {
  try {
    sessionStorage.setItem(SHARE_SESSION_KEY, token)
  } catch {
    /* storage unavailable: share mode lasts until a reload */
  }
}

export function clearSessionShare(): void {
  try {
    sessionStorage.removeItem(SHARE_SESSION_KEY)
  } catch {
    /* storage unavailable */
  }
}
