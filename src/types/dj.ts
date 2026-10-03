// src/types/dj.ts
// DJ pages over IPC. The Rust DTOs in commands/dj.rs are camelCase so these
// read the same as the `dj-tracks-progress` event.

export interface DjProfile {
  /** `trim().toLowerCase()` of the name — the watched-DJ rule. */
  nameKey: string
  displayName: string
  spotifyArtistId: string | null
  /** Picked by hand (or from a Spotify card): never replaced automatically. */
  spotifyManual: boolean
  spotifyImageUrl: string | null
  /** Often empty: Spotify deprecated artist genres. */
  genres: string[]
  raArtistId: string | null
  raSlug: string | null
  raImageUrl: string | null
  raManual: boolean
  /** Unix ms of the last complete Spotify refresh. */
  spotifySyncedAt: number | null
  /** Unix ms of the last RA refresh that worked. */
  raSyncedAt: number | null
  /** The stored RA page, else one guessed from the name (may 404). */
  raUrl: string
  /** Spotify lists more appears-on / compilation releases than were fetched. */
  hasOlderReleases: boolean
}

export interface DjTrack {
  spotifyId: string
  /** Spotify's name, e.g. "Sunday Jams - Luciano Remix". */
  title: string
  /** Display string: "Ricardo Villalobos, Luciano". */
  artists: string
  /** The release it was found on. */
  album: string | null
  /** "2024-03-01", "2024-03" or "2024" — Spotify's precision. */
  releaseDate: string | null
  isrc: string | null
  durationMs: number | null
}

export interface DjGig {
  raEventId: string
  /**
   * The venue's local day in the format "YYYY-MM-DD", as stored and as sent
   * here: the Rust side trims RA's "2026-10-12T00:00:00.000" down to its
   * first ten characters ("2026-10-12") before storing.
   */
  date: string
  venue: string | null
  city: string | null
  /** ISO code, e.g. "ES". */
  country: string | null
  /** The other artists on the bill, "Marco Carola, Loco Dice". */
  lineup: string | null
  url: string | null
}

export interface DjPage {
  profile: DjProfile
  /** Duplicates collapsed, newest first. */
  tracks: DjTrack[]
  gigs: DjGig[]
  /** Releases listed but whose tracks are not fetched yet (an interrupted first fetch). */
  pendingReleases: number
}

/** One row of a saved set, for Plays. */
export interface DjSetTrack {
  videoId: string
  artist: string | null
  title: string
  mix: string | null
  isUnknown: boolean
}

/** A search result on Spotify or RA: a Search card, or a "Not this artist?" choice. */
export interface ArtistCandidate {
  id: string
  name: string
  imageUrl: string | null
  /** Spotify no longer gives followers to personal apps: usually null. */
  followers: number | null
  /** RA only: the `ra.co/dj/<slug>` part. */
  slug: string | null
}

/**
 * A "Not this artist?" choice on RA, as `set_dj_ra_artist` takes it: the RA id,
 * the `ra.co/dj/<slug>` part, and the photo — built from an `ArtistCandidate`
 * whose `slug` is set.
 */
export interface RaPick {
  id: string
  slug: string
  imageUrl: string | null
}

export interface DjCandidates {
  spotify: ArtistCandidate[]
  ra: ArtistCandidate[]
}

export type RefreshOutcome =
  /**
   * Cached data is new enough; nothing was asked. Also a refresh that
   * stopped quietly because the artist was re-picked or Spotify was
   * disconnected meanwhile.
   */
  | 'fresh'
  | 'refreshed'
  /** The fetch failed; the cache is as it was. */
  | 'failed'
  /** No artist of that name on the source. */
  | 'notFound'
  /** Spotify only: no account connected. */
  | 'notConnected'

export interface DjRefresh {
  outcome: RefreshOutcome
  error: string | null
}

/** Payload of `dj-tracks-progress`, sent after every batch of releases. */
export interface DjTracksProgress {
  nameKey: string
  done: number
  total: number
}

export const DJ_TRACKS_PROGRESS_EVENT = 'dj-tracks-progress'
