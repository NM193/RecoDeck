// src/lib/spotify/title.ts
/**
 * Spotify titles, put into the shape the library matcher and the stores use.
 *
 * Spotify writes the version after a dash — "Little Girl - Original Mix",
 * "Come Get Up - Extended Mix" — where a tag or a tracklist puts it in
 * brackets. Read as part of the title, the version would stop a remix from
 * being told apart from the extended mix, and Copy would search a store for
 * the wrong thing.
 */
import { normalise } from '../tracklist/text'
import type { Track } from '../tracklist/types'
import type { SpotifyTrack } from '../../types/spotify'

/** Words that make a suffix a version rather than part of the title. */
const VERSION_WORDS =
  /\b(remix|mix|edit|version|bootleg|dub|rework|vip|remaster|remastered|instrumental|acapella|acappella|live|rerub|reprise)\b/i

/** "… - Extended Mix": the last spaced dash, so "Love - Me - Dub" keeps "Love - Me". */
const DASH_SUFFIX = /^(.*\S)\s+[-–—]\s+((?:(?!\s[-–—]\s).)+)$/

/** "… (Extended Mix)" / "… [Dub]" at the end, the way some labels write it. */
const BRACKET_SUFFIX = /^(.*\S)\s*[([]([^()[\]]+)[)\]]$/

/** "(feat. X)", "[ft. X]", "(with X)" anywhere in the title. */
const FEAT = /\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+[^()[\]]+[)\]]/i

export interface SpotifyTitle {
  /** Without the version: "I Need A Rush (feat. Sheree Hicks)". */
  title: string
  /** "Extended Mix", or null. */
  mix: string | null
  /** Without the version or the featured artist: "I Need A Rush". */
  bare: string
}

export function splitSpotifyTitle(name: string): SpotifyTitle {
  let title = name.replace(/\s+/g, ' ').trim()
  let mix: string | null = null

  const dash = DASH_SUFFIX.exec(title)
  if (dash && VERSION_WORDS.test(dash[2])) {
    title = dash[1].trim()
    mix = dash[2].trim()
  } else {
    const bracket = BRACKET_SUFFIX.exec(title)
    if (bracket && VERSION_WORDS.test(bracket[2])) {
      title = bracket[1].trim()
      mix = bracket[2].trim()
    }
  }

  const bare = title.replace(FEAT, '').trim() || title
  return { title, mix, bare }
}

/**
 * What `matchOne` reads, built the way the tracklist parser builds a row:
 * the title to match on is the bare one, and `titleNorm` carries the
 * featured artist and the version — so both spellings are tried.
 */
export function toParsed(
  track: SpotifyTrack,
): Pick<Track, 'title' | 'mix' | 'artist' | 'titleNorm' | 'artistNorm'> {
  const { title, mix, bare } = splitSpotifyTitle(track.title)
  return {
    artist: track.artists || null,
    title: bare,
    mix,
    artistNorm: normalise(track.artists),
    titleNorm: normalise([title, mix].filter(Boolean).join(' ')),
  }
}

/**
 * "Artist(s) - Title (Mix)". The mix is kept: the version is what matters when
 * searching a store. "(feat. X)" is not: Spotify already lists X as an artist.
 */
export function copyText(track: SpotifyTrack): string {
  const { bare, mix } = splitSpotifyTitle(track.title)
  const name = mix ? `${bare} (${mix})` : bare
  return credit(track.artists, name)
}

/** "Artists - Name", or whichever half there is: never a dangling "Artists - ". */
function credit(artists: string, name: string): string {
  if (!name) return artists
  return artists ? `${artists} - ${name}` : name
}

const SELECTED_RECS_SEARCH = 'https://srv.selectedrecs.com/#/search?text='

/**
 * The same text as Copy, without the mix: the store lists every version of a
 * release, and the mix only narrows the search to nothing.
 */
export function selectedRecsUrl(track: SpotifyTrack): string {
  const { bare } = splitSpotifyTitle(track.title)
  const text = credit(track.artists, bare)
  return SELECTED_RECS_SEARCH + encodeURIComponent(text)
}
