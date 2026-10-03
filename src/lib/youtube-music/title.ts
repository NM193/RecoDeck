// src/lib/youtube-music/title.ts
/**
 * YouTube titles, read into the shape the library matcher reads — the shape
 * `toParsed` gives a Spotify track.
 *
 * A YouTube title carries everything in one string — "Soulva - Odyssey
 * (Original Mix)" — with upload noise ("(Official Video)", "[Free Download]")
 * and often a label or a series after a bar. YouTube's auto-generated artist
 * channels ("Extrawelt - Topic") name the artist when the title does not.
 */
import { ARTIST_TITLE, foldAccents, normalise } from '../tracklist/text'
import { selectedRecsSearchUrl } from '../spotify/title'
import type { MatchInput } from '../spotify/ownership'
import type { YtmTrack } from '../../types/youtubeMusic'

/** Brackets that say what kind of upload it is, not which record. */
const NOISE =
  /\s*[([]\s*(?:official\s+(?:music\s+)?(?:video|audio|visuali[sz]er|lyric\s+video)|official|music\s+video|video|audio|visuali[sz]er|lyrics?(?:\s+video)?|hd|hq|4k|premiere|free\s+(?:download|dl)|out\s+now)\s*[)\]]/gi

/** " | Drumcode", " | Live Vinyl DJ Set | …": everything from the first spaced bar. */
const BAR = /\s+\|\s+.*$/

/** A trailing "(Monthy Nolan Edit)" or "[Dub Mix]": the version, with the tracklist parser's words. */
const MIX =
  /\s*[([]([^()[\]]*\b(?:remix|mix|edit|version|bootleg|dub|rework|vip|remaster)\b[^()[\]]*)[)\]]\s*$/i

/** "(feat. X)", "[ft. X]", "(with X)": in the title, not in the bare title. */
const FEAT = /\s*[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+[^()[\]]+[)\]]/i

/** YouTube's auto-generated artist channels: "Extrawelt - Topic". */
const TOPIC = /\s+-\s+Topic$/

export interface YouTubeTitle {
  /** "Nina Kraviz"; a Topic channel's artist; or null when nothing names one. */
  artist: string | null
  /** Without the mix: "I Need A Rush (feat. Sheree Hicks)". */
  title: string
  /** "Monthy Nolan Edit", or null. */
  mix: string | null
  /** Without the mix or the featured artist: "I Need A Rush". */
  bare: string
}

/** A channel's name without YouTube's " - Topic". */
export function channelArtist(channel: string): string {
  return channel.trim().replace(TOPIC, '')
}

export function parseYouTubeTitle(raw: string, channel: string): YouTubeTitle {
  const clean = raw.replace(/\s+/g, ' ').trim()
  // 1. Upload noise. A title that was only noise is kept as it was.
  let text = clean.replace(NOISE, '').trim() || clean
  // 2. A label or a set's billing after the first bar.
  text = text.replace(BAR, '').trim() || text

  // 3. The first spaced dash splits artist from title.
  // 4. Without one, a Topic channel is the artist.
  let artist: string | null = null
  const split = ARTIST_TITLE.exec(text)
  if (split && split[1].trim() && split[2].trim()) {
    artist = split[1].trim()
    text = split[2].trim()
  } else if (TOPIC.test(channel.trim())) {
    artist = channelArtist(channel) || null
  }

  let mix: string | null = null
  const version = MIX.exec(text)
  if (version && version.index > 0) {
    mix = version[1].trim()
    text = text.slice(0, version.index).trim()
  }

  const bare = text.replace(FEAT, '').trim() || text
  return { artist, title: text, mix, bare }
}

/**
 * What `matchOne` reads, built as Spotify's `toParsed` builds it: the bare
 * title to match on, and `titleNorm` carrying the featured artist and the
 * version, so both spellings are tried. No artist stays null: the matcher
 * then has only the title (see `ownershipOf`'s `titleOnly`).
 */
export function toParsed(track: YtmTrack): MatchInput {
  const { artist, title, mix, bare } = parseYouTubeTitle(track.title, track.channel)
  return {
    artist,
    title: bare,
    mix,
    artistNorm: artist ? normalise(foldAccents(artist)) : null,
    titleNorm: normalise(foldAccents([title, mix].filter(Boolean).join(' '))),
  }
}

/** "Artist - Name", or the name alone when no artist is known. */
function credit(artist: string | null, name: string): string {
  if (!name) return artist ?? ''
  return artist ? `${artist} - ${name}` : name
}

/** As Spotify's Copy: artist, bare title, and the mix — what a store search needs. */
export function copyText(track: YtmTrack): string {
  const { artist, bare, mix } = parseYouTubeTitle(track.title, track.channel)
  return credit(artist, mix ? `${bare} (${mix})` : bare)
}

/** As Spotify's: the Copy text without the mix — the store lists every version. */
export function selectedRecsUrl(track: YtmTrack): string {
  const { artist, bare } = parseYouTubeTitle(track.title, track.channel)
  return selectedRecsSearchUrl(credit(artist, bare))
}

const MUSIC_WATCH = 'https://music.youtube.com/watch?v='

/** The exact video on YouTube Music: no search needed. */
export function musicUrl(videoId: string): string {
  return MUSIC_WATCH + encodeURIComponent(videoId)
}
