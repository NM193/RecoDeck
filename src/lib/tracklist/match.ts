/**
 * Matching a parsed tracklist against the user's own library.
 *
 * This is the part the standalone tool could never do: in RecoDeck the library
 * is the reference, so a set stops being a list of names and becomes an answer
 * to "of these 42 records, which do I already have".
 *
 * The comparison reuses the parser's own soft name matching rather than exact
 * string equality, because tags and typed-out tracklists never agree exactly:
 * one says "Crusy", the other "Crusy, Karretero"; one has "(Extended Mix)" in
 * the title, the other in a separate field.
 *
 * No database work is involved — the app already holds every track in memory,
 * so this is a loop over what is on screen.
 */

import { containment, normalise, tokenSet } from './text'
import type { Track } from './types'

/** The minimum shape needed from a library track — matches src/types/track.ts. */
export interface LibraryTrack {
  id: number
  title?: string
  artist?: string
  file_path: string
}

export interface LibraryMatch {
  track: LibraryTrack
  /** 0-2: title agreement plus artist agreement. */
  score: number
  /** Both names line up cleanly, not just a containment pass. */
  strong: boolean
}

const TITLE_THRESHOLD = 0.8
const ARTIST_THRESHOLD = 0.6

/**
 * How lopsided two titles may be and still count as the same record.
 *
 * `containment` divides by the smaller side, so a one-word title scores a
 * perfect 1.0 against any longer title containing that word: "Lost" matched a
 * file called "Lee Burridge & Lost Desert - Elongi feat. Junior". Requiring the
 * shorter side to be at least half the longer one kills that whole class of
 * false positive while leaving "Kids" against "Kids (Extended Mix)" alone.
 */
const MIN_SIZE_RATIO = 0.5

/** Placeholder tags that carry no information about who made the record. */
const NO_ARTIST = /^(unknown artist|unknown|various artists|various|va)$/

interface Indexed {
  track: LibraryTrack
  titleNorm: string | null
  artistNorm: string | null
}

/** Title agreement, or null when the two are not the same record. */
function titleAgreement(a: string | null, b: string | null): number | null {
  const A = tokenSet(a)
  const B = tokenSet(b)
  if (!A.size || !B.size) return null

  const score = containment(a, b)
  if (score < TITLE_THRESHOLD) return null

  const ratio = Math.min(A.size, B.size) / Math.max(A.size, B.size)
  if (ratio < MIN_SIZE_RATIO) return null

  return score
}

/**
 * Pre-normalises the library once. With ~8,000 tracks and ~40 parsed rows this
 * is the difference between one pass and forty.
 */
export function indexLibrary(library: LibraryTrack[]): Indexed[] {
  return library.map((track) => {
    const artistNorm = normalise(track.artist)
    return {
      track,
      titleNorm: normalise(track.title),
      // "Unknown Artist" in a tag is the same as no artist at all.
      artistNorm: artistNorm && NO_ARTIST.test(artistNorm) ? null : artistNorm,
    }
  })
}

/**
 * The best library track for one parsed row, or null.
 *
 * When either side has no artist the title alone has to carry the decision, so
 * the bar goes up: a one-word title like "Jolene" must not claim a match on its
 * own, since half a dozen different records share it.
 */
/**
 * The best library track for one parsed row, or null.
 *
 * Both spellings of the title are tried: with the mix suffix and without. A
 * tracklist writes "Horny (Radio Slave Just 17 Mix)" where the file is tagged
 * plainly "Horny", and either side may be the fuller one.
 *
 * With no artist to compare on either side the title has to carry the whole
 * decision, so it must match outright rather than merely be contained.
 */
export function matchOne(
  parsed: Pick<Track, 'title' | 'mix' | 'artist' | 'titleNorm' | 'artistNorm'>,
  indexed: Indexed[],
): LibraryMatch | null {
  const baseNorm = normalise(parsed.title)
  const fullNorm = parsed.titleNorm ?? baseNorm
  const titleForms = [...new Set([fullNorm, baseNorm].filter(Boolean))] as string[]
  if (!titleForms.length) return null

  const parsedArtist =
    parsed.artistNorm && !NO_ARTIST.test(parsed.artistNorm) ? parsed.artistNorm : null

  let best: LibraryMatch | null = null

  for (const entry of indexed) {
    if (!entry.titleNorm) continue

    let titleScore: number | null = null
    for (const form of titleForms) {
      const score = titleAgreement(form, entry.titleNorm)
      if (score !== null && (titleScore === null || score > titleScore)) titleScore = score
    }
    if (titleScore === null) continue

    const bothHaveArtist = Boolean(parsedArtist && entry.artistNorm)
    const artistScore = bothHaveArtist ? containment(parsedArtist, entry.artistNorm) : 0

    if (bothHaveArtist) {
      if (artistScore < ARTIST_THRESHOLD) continue
    } else if (titleScore < 1 || tokenSet(entry.titleNorm).size < 2) {
      // Nothing but a title to go on, and it is neither exact nor distinctive.
      continue
    }

    const score = titleScore + artistScore
    if (!best || score > best.score) {
      best = { track: entry.track, score, strong: bothHaveArtist && artistScore >= 0.8 }
    }
  }

  return best
}

export interface MatchSummary {
  /** Keyed by the parsed track's index. */
  byIndex: Map<number, LibraryMatch>
  owned: number
  missing: number
}

/** Matches a whole parsed tracklist against the library. */
export function matchTracklist(tracks: Track[], library: LibraryTrack[]): MatchSummary {
  const indexed = indexLibrary(library)
  const byIndex = new Map<number, LibraryMatch>()

  let owned = 0
  let missing = 0

  for (const track of tracks) {
    // An unnamed slot cannot be looked for; it is neither owned nor missing.
    if (track.isUnknown) continue

    const match = matchOne(track, indexed)
    if (match) {
      byIndex.set(track.index, match)
      owned += 1
    } else {
      missing += 1
    }
  }

  return { byIndex, owned, missing }
}
