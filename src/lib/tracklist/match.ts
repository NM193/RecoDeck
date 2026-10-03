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

import { containmentOf, foldAccents, normalise, splitArtistTitle, tokenSet } from './text'
import type { Track } from './types'

/** The minimum shape needed from a library track — matches src/types/track.ts. */
export interface LibraryTrack {
  id: number
  title?: string
  artist?: string
  file_path: string
  /**
   * Not used for matching, carried through it. The timeline draws the set's
   * tempo from the records the user owns, and the match is what says which
   * file a row turned out to be.
   */
  bpm?: number
}

export interface LibraryMatch {
  track: LibraryTrack
  /** 0-2: title agreement plus artist agreement. */
  score: number
  /** 0-1: how fully the titles agree. */
  titleScore: number
  /** 0-1: how fully the artists agree. Under 0.8 the match is not strong. */
  artistScore: number
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

/**
 * How much two named versions have to agree to count as the same record.
 *
 * A remix is a different record, and treating it as the same one produced the
 * worst kind of wrong answer: "Witch Doctor (Hot Since 82 Remix)" in the set was
 * matched to "Witch Doctor [Extended Mix]" on disk, and offered for playing.
 */
const MIN_VERSION_MATCH = 0.6

/**
 * How the matcher reads a name: `normalise` after folding accents, so a file
 * tagged "Kölsch" and a list typing "Kolsch" agree. The parser's own stored
 * norms are left unfolded — they are saved with a set and compared with the
 * standalone tool's output.
 */
function matchNorm(value: string | null | undefined): string | null {
  return value ? normalise(foldAccents(value)) : null
}

/**
 * A row's stored norm, with accents folded.
 *
 * The stored norm itself cannot be folded: `normalise` already turned the
 * accented letter into a space ("kid cr me"). So it is rebuilt from the raw
 * text it was made from — but only when normalising that text gives the stored
 * norm back, which proves it is the source. Otherwise (a merged row whose mix
 * came from another source, say) the stored norm is used as it is, and that
 * row compares exactly as it did before accents were folded.
 */
function foldedNorm(
  stored: string | null | undefined,
  ...sources: (string | null | undefined)[]
): string | null {
  if (!stored) return null
  for (const source of sources) {
    if (source && normalise(source) === stored) return matchNorm(source)
  }
  return stored
}

/**
 * The words a version may be made of and still be the artist's own cut.
 *
 * "Original Mix", "Extended Mix", "Radio Edit", "Club Mix", "Extended" — a
 * store, Spotify and a tag each pick one of these for the same record, and a DJ
 * owning the extended mix owns the record whose Spotify page says "Original
 * Mix". A remaster is the same cut too ("Extended Mix Remastered"). Anything
 * else in a version — a remixer's name, "dub", "instrumental", a year — makes
 * it a version of its own.
 */
const PLAIN_VERSION_WORDS = new Set([
  'original',
  'extended',
  'radio',
  'club',
  'main',
  'album',
  'single',
  'mix',
  'edit',
  'version',
  'remaster',
  'remastered',
])

/** A version made only of plain words: the record itself, not someone's take on it. */
function isPlainVersion(tokens: Set<string>): boolean {
  if (!tokens.size) return false
  for (const token of tokens) if (!PLAIN_VERSION_WORDS.has(token)) return false
  return true
}

/**
 * Whether two named versions can be the same record.
 *
 * Two plain versions always can. A plain version and a named one never can,
 * even when the name contains the plain words: "Hot Since 82 Extended Mix" is
 * not the "Extended Mix". Two named versions have to agree on most words.
 */
function sameVersion(A: Set<string>, B: Set<string>): boolean {
  const plainA = isPlainVersion(A)
  const plainB = isPlainVersion(B)
  if (plainA || plainB) return plainA && plainB
  return containmentOf(A, B) >= MIN_VERSION_MATCH
}

/** Bracketed segments that name a version rather than describe the track. */
const VERSION_WORDS =
  /\b(remix|mix|edit|version|bootleg|dub|rework|vip|remaster|instrumental|acapella|acappella)\b/i

/**
 * The version named inside a tag's title, if it names one.
 *
 * Read from the raw title on purpose: normalise() strips the common ones, which
 * is exactly the information needed here.
 */
export function versionOf(rawTitle: string | null | undefined): string | null {
  if (!rawTitle) return null

  for (const match of rawTitle.matchAll(/[([]([^)\]]+)[)\]]/g)) {
    const inside = match[1]
    if (VERSION_WORDS.test(inside)) return matchNorm(inside)
  }
  return null
}

/** Placeholder tags that carry no information about who made the record. */
const NO_ARTIST = /^(unknown artist|unknown|various artists|various|va)$/

export interface Indexed {
  track: LibraryTrack
  /** The names as the matcher reads them: normalised, accents folded. */
  titleNorm: string | null
  artistNorm: string | null
  /** "extended mix", "afterlife mix" — whatever the tag calls this version. */
  versionNorm: string | null
  /** The names split into words once, here, rather than on every comparison. */
  titleTokens: Set<string>
  artistTokens: Set<string>
  /** `versionNorm` split into words; empty when the tag names no version. */
  versionTokens: Set<string>
}

/**
 * The artist and title of a library track, wherever the tags happen to keep
 * them.
 *
 * Plenty of files carry no artist tag at all and put the whole thing in the
 * title: "Lee Burridge & Lost Desert - Elongi feat. Junior". Requiring an
 * artist without reading those would mark half a library as missing, so the
 * title is split the same way a written tracklist is.
 */
function creditsOf(track: LibraryTrack): { artist: string | null; title: string } {
  const tagged = normalise(track.artist)
  const artist = tagged && !NO_ARTIST.test(tagged) ? track.artist ?? null : null
  const title = track.title ?? ''

  if (artist) return { artist, title }

  const split = splitArtistTitle(title)
  return split.artist ? { artist: split.artist, title: split.title } : { artist: null, title }
}

/** Title agreement, or null when the two are not the same record. */
function titleAgreement(A: Set<string>, B: Set<string>): number | null {
  if (!A.size || !B.size) return null

  const score = containmentOf(A, B)
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
    const credits = creditsOf(track)
    const titleNorm = matchNorm(credits.title)
    const artistNorm = matchNorm(credits.artist)
    const versionNorm = versionOf(track.title)
    return {
      track,
      titleNorm,
      artistNorm,
      versionNorm,
      titleTokens: tokenSet(titleNorm),
      artistTokens: tokenSet(artistNorm),
      versionTokens: tokenSet(versionNorm),
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
 * Both the artist and the title have to agree. A title alone is not evidence —
 * dozens of records are called "Lost" or "Jolene" — and matching on it produced
 * exactly the kind of wrong answer that offers to play a stranger's record.
 *
 * Both spellings of the title are tried, with the mix suffix and without: a
 * tracklist writes "Horny (Radio Slave Just 17 Mix)" where the file is tagged
 * plainly "Horny", and either side may be the fuller one.
 */
/**
 * The spellings of a row's title the matcher tries — the full one (version,
 * featured artist) and the bare one — normalised with accents folded.
 * Exported so a pre-filter can look up exactly the words matching will use.
 */
export function titleFormsOf(parsed: Pick<Track, 'title' | 'mix' | 'titleNorm'>): string[] {
  const baseNorm = matchNorm(parsed.title)
  const fullNorm =
    foldedNorm(parsed.titleNorm, [parsed.title, parsed.mix].filter(Boolean).join(' '), parsed.title) ??
    baseNorm
  return [...new Set([fullNorm, baseNorm].filter(Boolean))] as string[]
}

export function matchOne(
  parsed: Pick<Track, 'title' | 'mix' | 'artist' | 'titleNorm' | 'artistNorm'>,
  indexed: Indexed[],
): LibraryMatch | null {
  const titleForms = titleFormsOf(parsed)
  if (!titleForms.length) return null

  const rowArtist = foldedNorm(parsed.artistNorm, parsed.artist)
  const parsedArtist = rowArtist && !NO_ARTIST.test(rowArtist) ? rowArtist : null
  // The tracklist keeps the version in its own field; a tag hides it in the title.
  const parsedVersion = matchNorm(parsed.mix) ?? versionOf(parsed.title)

  // Nothing to match against: the row itself does not say who played it.
  if (!parsedArtist) return null

  const formTokens = titleForms.map((form) => tokenSet(form))
  const artistTokens = tokenSet(parsedArtist)
  const versionTokens = tokenSet(parsedVersion)

  let best: LibraryMatch | null = null

  for (const entry of indexed) {
    if (!entry.titleNorm || !entry.artistNorm) continue

    // When both sides name a version, they have to be the same version (any
    // two plain ones count as the same, see `sameVersion`). When
    // only one does, the title still decides — a tracklist naming the remix
    // while the tag says only "Horny" is the same record written two ways.
    if (versionTokens.size && entry.versionTokens.size) {
      if (!sameVersion(versionTokens, entry.versionTokens)) continue
    }

    let titleScore: number | null = null
    for (const tokens of formTokens) {
      const score = titleAgreement(tokens, entry.titleTokens)
      if (score !== null && (titleScore === null || score > titleScore)) titleScore = score
    }
    if (titleScore === null) continue

    const artistScore = containmentOf(artistTokens, entry.artistTokens)
    if (artistScore < ARTIST_THRESHOLD) continue

    const score = titleScore + artistScore
    if (!best || score > best.score) {
      best = { track: entry.track, score, titleScore, artistScore, strong: artistScore >= 0.8 }
    }
  }

  return best
}

/**
 * The file for a row that names no artist — a bare YouTube title such as
 * "Honey Hunter" on a channel that is not the artist's. Only a full title
 * agreement counts, and the answer is never strong: dozens of records share
 * a title, so it can only make a Maybe the user confirms.
 */
export function matchTitleOnly(
  parsed: Pick<Track, 'title' | 'mix' | 'titleNorm'>,
  indexed: Indexed[],
): LibraryMatch | null {
  const formTokens = titleFormsOf(parsed).map((form) => tokenSet(form))
  if (!formTokens.length) return null
  const versionTokens = tokenSet(matchNorm(parsed.mix) ?? versionOf(parsed.title))

  for (const entry of indexed) {
    if (!entry.titleNorm) continue
    if (versionTokens.size && entry.versionTokens.size) {
      if (!sameVersion(versionTokens, entry.versionTokens)) continue
    }
    const agrees = formTokens.some(
      (tokens) => titleAgreement(tokens, entry.titleTokens) === 1,
    )
    if (agrees) {
      return { track: entry.track, score: 1, titleScore: 1, artistScore: 0, strong: false }
    }
  }
  return null
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
