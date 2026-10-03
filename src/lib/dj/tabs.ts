// src/lib/dj/tabs.ts
/**
 * The Tracks and Plays tabs' small decisions, kept out of the components so
 * they are tested: which state the Tracks tab is in and what its lines say,
 * a Plays row's bar and count, and what a double-click on an Owned row plays.
 */
import type { DjSourceStatus } from './page'
import type { Ownership } from '../spotify/ownership'
import type { StatusFilter } from '../spotify/rows'
import type { LibraryTrack } from '../tracklist/match'

/** The Tracks tab's chips, in the Spotify view's order (the overview's card shows All / Missing / Owned). */
export const TRACK_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'owned', label: 'Owned' },
]

/**
 * - `notConnected`: "Connect Spotify to see their tracks" (Spotify's own
 *   disconnect deletes the DJ tracks, so there is nothing cached to show).
 * - `list`: the cached rows — at once, also while a refresh runs or after it failed.
 * - `skeleton`: a first open with nothing cached (spec: "skeleton rows").
 * - `empty`: Spotify answered and there is nothing.
 */
export type TracksTabState = 'notConnected' | 'list' | 'skeleton' | 'empty'

export interface TracksTabInput {
  /** Spotify's connection; null while its status is still being read. */
  connected: boolean | null
  /** The cached page has been read once. */
  loaded: boolean
  /** Cached tracks. */
  tracks: number
  /** The page's Spotify refresh. */
  spotify: DjSourceStatus
}

export function tracksTabState({
  connected,
  loaded,
  tracks,
  spotify,
}: TracksTabInput): TracksTabState {
  if (connected === false) return 'notConnected'
  if (tracks > 0) return 'list'
  // Unknown connection counts as "still loading": no "Connect Spotify" flash on opening.
  if (!loaded || connected === null || spotify.refreshing) return 'skeleton'
  return 'empty'
}

/** The line above the table while Spotify is asked: "Loading releases… 120 of 400". */
export function tracksProgress(
  spotify: DjSourceStatus,
  progress: { done: number; total: number } | null,
): string | null {
  if (progress) return `Loading releases… ${progress.done} of ${progress.total}`
  if (spotify.refreshing) return 'Loading releases…'
  return null
}

/**
 * Why the Tracks tab is empty.
 * @param hasArtist the profile has a Spotify artist (none was found, or "None" was picked).
 */
export function tracksEmptyText(
  spotify: DjSourceStatus,
  hasArtist: boolean,
): string {
  if (spotify.outcome === 'failed')
    return "Couldn't reach Spotify. The tracks load the next time this page opens."
  if (!hasArtist || spotify.outcome === 'notFound') {
    return 'No Spotify artist by this name. Pick one under ⋯ → Not this artist?'
  }
  return 'No tracks of theirs on Spotify.'
}

/** A Plays row's bar: its share of the DJ's saved sets, as a CSS width in percent (0–100). */
export function playShare(count: number, sets: number): number {
  if (sets <= 0) return 0
  return Math.round(Math.min(1, Math.max(0, count / sets)) * 100)
}

/** "in 4 of 6 sets"; "in 1 of 1 set". */
export function inSets(count: number, sets: number): string {
  return `in ${count} of ${sets} ${sets === 1 ? 'set' : 'sets'}`
}

/**
 * A double-click on an Owned row plays its file, queued with the other Owned
 * rows on screen in their order — as the Spotify view does. Null for a row
 * that is not Owned (or has no file).
 * @param shown the ownership of every row on screen, in order.
 */
export function ownedQueue(
  shown: Ownership[],
  target: Ownership,
): { queue: LibraryTrack[]; index: number } | null {
  const file = target.kind === 'owned' ? target.file : undefined
  if (!file) return null
  const queue = shown.flatMap((ownership) =>
    ownership.kind === 'owned' && ownership.file ? [ownership.file] : [],
  )
  const index = queue.findIndex((track) => track.id === file.id)
  return index < 0 ? null : { queue, index }
}
