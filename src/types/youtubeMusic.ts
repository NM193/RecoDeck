// The YouTube Music section's shapes over IPC. The Rust DTOs are camelCase so
// these read the same as the `youtube-music-synced` event.
import type { Verdict } from './spotify'

/** Liked music's id in `ytm_lists` — YouTube's own. */
export const LIKED_MUSIC = 'LM'
/** "All playlists" — never stored; it is every list at once. */
export const ALL_YTM_LISTS = 'all'

export interface YtmList {
  /** `LM`, or a YouTube playlist id. */
  id: string
  name: string
  /** Liked music 0, then playlists in the order they were added. */
  position: number
  /** Available items at the last full read, a video listed twice counted twice. */
  trackCount: number
  /** YouTube's totalResults at the last full read, unavailable items included. */
  totalResults: number | null
  /** Unix ms. A pair first seen later than this is new in this list. */
  lastOpenedAt: number
  /** Unix ms; set while YouTube says the playlist does not exist. */
  unavailableAt: number | null
}

export interface YtmTrack {
  videoId: string
  /** As YouTube writes it: "Soulva - Odyssey (Original Mix)". */
  title: string
  /** The video owner's channel: "Extrawelt - Topic". */
  channel: string
  /** Null until YouTube gave it. Over 20 minutes is a set. */
  durationMs: number | null
}

export interface YtmEntry {
  listId: string
  videoId: string
  /** When it was added to the playlist (ISO), or null. */
  addedAt: string | null
  /** Unix ms of the sync that first stored this pair. */
  firstSeenAt: number
}

export interface YtmVerdict {
  videoId: string
  libraryTrackId: number
  verdict: Verdict
}

export interface YtmLibrary {
  lists: YtmList[]
  tracks: YtmTrack[]
  entries: YtmEntry[]
  verdicts: YtmVerdict[]
}

/** Why the last sync failed, in the kinds the view words differently. */
export type YtmErrorKind = 'network' | 'quotaExceeded' | 'other'

export interface YtmStatus {
  /** A client file was chosen: Connect can work. */
  hasClient: boolean
  connected: boolean
  email: string | null
  /** The refresh token was revoked or expired: show "Reconnect YouTube Music". */
  needsReconnect: boolean
  /** Settings → YouTube Music → Show in sidebar. */
  showInSidebar: boolean
  /** Unix ms of the last successful sync. */
  lastSyncedAt: number | null
  lastError: string | null
  /** Set with lastError. */
  lastErrorKind: YtmErrorKind | null
  /** YouTube said the quota is used up today (Pacific). */
  quotaUsedUp: boolean
}

/** Payload of the `youtube-music-synced` event, shaped like `spotify-synced`. */
export interface YtmSynced {
  changed: boolean
  lastSyncedAt: number | null
  error: string | null
  errorKind: YtmErrorKind | null
  needsReconnect: boolean
}

export const YTM_SYNCED_EVENT = 'youtube-music-synced'
