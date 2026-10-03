// src/lib/spotify/ownership.ts
/**
 * Owned / Maybe / Missing for every Spotify track, against the library.
 *
 * Ownership is never stored: it is worked out again whenever the library or
 * the Spotify data changes, so a track turns Owned the moment its file is
 * scanned. That is ~1,000 tracks against ~8,500 files, and the sidebar needs
 * the answer at start-up, so two things keep it cheap:
 * - the library's names are split into words once (`indexLibrary`);
 * - a track is compared only with files sharing at least one title word. A
 *   title match needs a shared word, so the answer is exactly what comparing
 *   with every file would give.
 */
import { tokenSet } from '../tracklist/text'
import {
  indexLibrary,
  matchOne,
  titleFormsOf,
  type Indexed,
  type LibraryMatch,
  type LibraryTrack,
} from '../tracklist/match'
import type { SpotifyTrack, SpotifyVerdict } from '../../types/spotify'
import { toParsed } from './title'

export type OwnershipKind = 'owned' | 'maybe' | 'missing'

export interface Ownership {
  kind: OwnershipKind
  /** The library file: the match, or the one confirmed with Yes. */
  file?: LibraryTrack
  /** Maybe only: "same title, artist partly matches". */
  reason?: string
}

export interface OwnershipIndex {
  entries: Indexed[]
  byId: Map<number, LibraryTrack>
  /** Title word → positions in `entries` of the files whose title has it. */
  byToken: Map<string, number[]>
}

export function buildOwnershipIndex(library: LibraryTrack[]): OwnershipIndex {
  const entries = indexLibrary(library)
  const byToken = new Map<string, number[]>()
  entries.forEach((entry, position) => {
    for (const token of entry.titleTokens) {
      const bucket = byToken.get(token)
      if (bucket) bucket.push(position)
      else byToken.set(token, [position])
    }
  })
  return { entries, byId: new Map(library.map((track) => [track.id, track])), byToken }
}

/** Files sharing a title word with the track, in library order, minus those answered No. */
function candidates(
  index: OwnershipIndex,
  parsed: ReturnType<typeof toParsed>,
  excluded: Set<number> | undefined,
): Indexed[] {
  const positions = new Set<number>()
  for (const form of titleFormsOf(parsed)) {
    for (const token of tokenSet(form)) {
      for (const position of index.byToken.get(token) ?? []) positions.add(position)
    }
  }
  return [...positions]
    .sort((a, b) => a - b)
    .map((position) => index.entries[position])
    .filter((entry) => !excluded?.has(entry.track.id))
}

/** Why a Maybe is unsure, in the words the sub-row shows. */
export function maybeReason(match: Pick<LibraryMatch, 'titleScore' | 'artistScore'>): string {
  const title = match.titleScore >= 1 ? 'same title' : 'similar title'
  // A match is Maybe only when it is not `strong`, and `strong` means an
  // artistScore of 0.8 or more, so a Maybe's artist never fully agrees: in
  // practice this always reads "artist partly matches". The "same artist"
  // branch only matters if what counts as `strong` ever changes.
  const artist = match.artistScore >= 1 ? 'same artist' : 'artist partly matches'
  return `${title}, ${artist}`
}

export function classifyTracks(
  tracks: SpotifyTrack[],
  index: OwnershipIndex,
  verdicts: SpotifyVerdict[],
): Map<string, Ownership> {
  const yes = new Map<string, number>()
  const no = new Map<string, Set<number>>()
  for (const verdict of verdicts) {
    // A verdict about a file that is gone says nothing any more.
    if (!index.byId.has(verdict.libraryTrackId)) continue
    if (verdict.verdict === 'yes') {
      yes.set(verdict.spotifyId, verdict.libraryTrackId)
    } else {
      const set = no.get(verdict.spotifyId) ?? new Set<number>()
      set.add(verdict.libraryTrackId)
      no.set(verdict.spotifyId, set)
    }
  }

  const result = new Map<string, Ownership>()
  for (const track of tracks) {
    const confirmed = yes.get(track.spotifyId)
    if (confirmed !== undefined) {
      result.set(track.spotifyId, { kind: 'owned', file: index.byId.get(confirmed) })
      continue
    }

    const parsed = toParsed(track)
    const match = matchOne(parsed, candidates(index, parsed, no.get(track.spotifyId)))
    if (!match) {
      result.set(track.spotifyId, { kind: 'missing' })
    } else if (match.strong) {
      result.set(track.spotifyId, { kind: 'owned', file: match.track })
    } else {
      result.set(track.spotifyId, { kind: 'maybe', file: match.track, reason: maybeReason(match) })
    }
  }
  return result
}
