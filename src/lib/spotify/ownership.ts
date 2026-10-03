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
  matchTitleOnly,
  titleFormsOf,
  type Indexed,
  type LibraryMatch,
  type LibraryTrack,
} from '../tracklist/match'
import type { Track } from '../tracklist/types'
import type { SpotifyTrack, SpotifyVerdict, Verdict } from '../../types/spotify'
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
  return {
    entries,
    byId: new Map(library.map((track) => [track.id, track])),
    byToken,
  }
}

/**
 * What the matcher reads of a row, whatever it came from: a Spotify track
 * through its `toParsed`, a YouTube video through its own, or a set's row as
 * it is.
 */
export type MatchInput = Pick<Track, 'title' | 'mix' | 'artist' | 'titleNorm' | 'artistNorm'>

/** One row to classify. Spotify, YouTube Music and DJ pages all make these. */
export interface OwnershipItem {
  /** A Spotify id or a YouTube video id: the key of the answer and of its verdicts. */
  id: string
  parsed: MatchInput
  /** With no artist, a file with the same title is a Maybe rather than Missing. */
  titleOnly?: boolean
}

export interface OwnershipVerdict {
  id: string
  libraryTrackId: number
  verdict: Verdict
}

/** Files sharing a title word with the track, in library order, minus those answered No. */
function candidates(
  index: OwnershipIndex,
  parsed: MatchInput,
  excluded: Set<number> | undefined,
): Indexed[] {
  const positions = new Set<number>()
  for (const form of titleFormsOf(parsed)) {
    for (const token of tokenSet(form)) {
      for (const position of index.byToken.get(token) ?? [])
        positions.add(position)
    }
  }
  return [...positions]
    .sort((a, b) => a - b)
    .map((position) => index.entries[position])
    .filter((entry) => !excluded?.has(entry.track.id))
}

/** Why a Maybe is unsure, in the words the sub-row shows. */
export function maybeReason(
  match: Pick<LibraryMatch, 'titleScore' | 'artistScore'>,
): string {
  const title = match.titleScore >= 1 ? 'same title' : 'similar title'
  // A match is Maybe only when it is not `strong`, and `strong` means an
  // artistScore of 0.8 or more, so a Maybe's artist never fully agrees: in
  // practice this always reads "artist partly matches". The "same artist"
  // branch only matters if what counts as `strong` ever changes.
  const artist =
    match.artistScore >= 1
      ? 'same artist'
      : match.artistScore === 0
        ? 'artist unknown'
        : 'artist partly matches'
  return `${title}, ${artist}`
}

/**
 * Owned / Maybe / Missing for one row, by the library match alone: no verdicts.
 * `excluded` holds files already answered No for this row. `titleOnly` lets a
 * row that names no artist match on its title (`matchTitleOnly`), as a Maybe.
 */
export function ownershipOf(
  parsed: MatchInput,
  index: OwnershipIndex,
  excluded?: Set<number>,
  titleOnly = false,
): Ownership {
  const pool = candidates(index, parsed, excluded)
  const match = matchOne(parsed, pool)
  if (match) {
    if (match.strong) return { kind: 'owned', file: match.track }
    return { kind: 'maybe', file: match.track, reason: maybeReason(match) }
  }
  if (titleOnly && !parsed.artist) {
    const byTitle = matchTitleOnly(parsed, pool)
    if (byTitle)
      return { kind: 'maybe', file: byTitle.track, reason: maybeReason(byTitle) }
  }
  return { kind: 'missing' }
}

/** Every row's answer, keyed by its id, with Yes / No verdicts applied. */
export function classifyItems(
  items: OwnershipItem[],
  index: OwnershipIndex,
  verdicts: OwnershipVerdict[],
): Map<string, Ownership> {
  const yes = new Map<string, number>()
  const no = new Map<string, Set<number>>()
  for (const verdict of verdicts) {
    // A verdict about a file that is gone says nothing any more.
    if (!index.byId.has(verdict.libraryTrackId)) continue
    if (verdict.verdict === 'yes') {
      yes.set(verdict.id, verdict.libraryTrackId)
    } else {
      const set = no.get(verdict.id) ?? new Set<number>()
      set.add(verdict.libraryTrackId)
      no.set(verdict.id, set)
    }
  }

  const result = new Map<string, Ownership>()
  for (const item of items) {
    const confirmed = yes.get(item.id)
    if (confirmed !== undefined) {
      result.set(item.id, { kind: 'owned', file: index.byId.get(confirmed) })
      continue
    }
    result.set(
      item.id,
      ownershipOf(item.parsed, index, no.get(item.id), item.titleOnly ?? false),
    )
  }
  return result
}

/** Spotify's tracks and verdicts, through the shared shape. */
export function classifyTracks(
  tracks: SpotifyTrack[],
  index: OwnershipIndex,
  verdicts: SpotifyVerdict[],
): Map<string, Ownership> {
  return classifyItems(
    tracks.map((track) => ({ id: track.spotifyId, parsed: toParsed(track) })),
    index,
    verdicts.map((v) => ({
      id: v.spotifyId,
      libraryTrackId: v.libraryTrackId,
      verdict: v.verdict,
    })),
  )
}
