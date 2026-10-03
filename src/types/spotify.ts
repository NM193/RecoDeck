// The Spotify section's shapes over IPC. The Rust DTOs are camelCase so these
// read the same as the `spotify-synced` event the spec describes.

/** Liked Songs' id in `spotify_lists`. Playlist ids are 22-character base62, so it cannot collide. */
export const LIKED = 'liked'
/** "All playlists" — never stored; it is every list at once. */
export const ALL_LISTS = 'all'

export interface SpotifyList {
  /** `liked`, or a Spotify playlist id. */
  id: string
  name: string
  /** Liked Songs 0, then playlists in Spotify's order. */
  position: number
  /** The total Spotify last reported, skipped items included. */
  trackCount: number
  /** Unix ms. A pair first seen later than this is new in this list. */
  lastOpenedAt: number
}

export interface SpotifyTrack {
  spotifyId: string
  /** Spotify's name, e.g. "Little Girl - Original Mix". */
  title: string
  /** Display string: "Moreno & Prieto, Sortech". */
  artists: string
  album: string | null
  durationMs: number | null
}

export interface SpotifyEntry {
  listId: string
  spotifyId: string
  /** Spotify's ISO time of the like/add, or null when it has none. */
  addedAt: string | null
  /** Unix ms of the sync that first stored this pair. */
  firstSeenAt: number
}

export type Verdict = 'yes' | 'no'

export interface SpotifyVerdict {
  spotifyId: string
  libraryTrackId: number
  verdict: Verdict
}

export interface SpotifyLibrary {
  lists: SpotifyList[]
  tracks: SpotifyTrack[]
  entries: SpotifyEntry[]
  verdicts: SpotifyVerdict[]
}

/** Why the last sync failed, in the kinds the view words differently. */
export type SpotifyErrorKind =
  | 'network'
  | 'rateLimited'
  /** 403 on the account's own library: not on the app's User Management list. */
  | 'notOnUserManagement'
  | 'other'

export interface SpotifyStatus {
  clientId: string | null
  connected: boolean
  accountName: string | null
  /** The refresh token was revoked or expired: show "Reconnect Spotify". */
  needsReconnect: boolean
  /**
   * Settings → Spotify → Show in sidebar. Off hides the section and pauses
   * the sync; DJ pages and Search keep using the account.
   */
  showInSidebar: boolean
  /** Unix ms of the last successful sync. */
  lastSyncedAt: number | null
  /** Why the last sync failed, or null when it worked. */
  lastError: string | null
  /** Set with lastError. */
  lastErrorKind: SpotifyErrorKind | null
  /** Names of the playlists Spotify would not share. */
  refused: string[]
  /** Names of the playlists the last sync could not read; their old rows stay. */
  unreadable: string[]
}

/** Payload of the `spotify-synced` event, sent after every sync. */
export interface SpotifySynced {
  changed: boolean
  lastSyncedAt: number | null
  error: string | null
  /** Set with error. */
  errorKind: SpotifyErrorKind | null
  needsReconnect: boolean
}

export const SPOTIFY_SYNCED_EVENT = 'spotify-synced'

/** openedWeb: the Spotify app would not open, so the web player did. */
export type PlayOutcome = 'played' | 'openedApp' | 'openedWeb'
