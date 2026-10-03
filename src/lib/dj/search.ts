/**
 * Search's DJs row: the DJs the user knows, then artists only Spotify knows,
 * as round cards. Known DJs are never capped; Spotify adds at most six.
 */
import { djCardSubtitle, djKey, newOnSpotify, type KnownDj } from './names'
import { asSpotifyTrack } from './tracks'
import { classifyTracks, type OwnershipIndex } from '../spotify/ownership'
import type { SpotifyVerdict } from '../../types/spotify'
import type { ArtistCandidate, DjTrack } from '../../types/dj'

/** Spotify cards after the known DJs. Search asks Spotify for 10 so six remain. */
export const MAX_SPOTIFY_CARDS = 6

export interface DjSearchCard {
  /** Unique in the row: the name key, or `spotify:<id>` for a Spotify card. */
  key: string
  name: string
  /** Spotify cards only: the page stores this artist as a manual match. */
  spotifyArtistId: string | null
  imageUrl: string | null
  /** "6 sets · you own 23", "watched", "on Spotify". */
  subtitle: string
}

/**
 * @param shown  the known DJs matching the query (`findKnownDjs`), in order.
 * @param spotify Spotify's artist search for the same query.
 * @param owned  "you own N" per name key; a key that is absent shows no number.
 */
export function djSearchCards(
  shown: KnownDj[],
  spotify: ArtistCandidate[],
  owned: Map<string, number>,
): DjSearchCard[] {
  const known = shown.map((dj) => ({
    key: dj.key,
    name: dj.name,
    spotifyArtistId: null,
    // Spotify's artist of exactly this name is the one the page resolves to
    // on its own, so its photo is the page's photo too.
    imageUrl:
      spotify.find((artist) => djKey(artist.name) === dj.key)?.imageUrl ?? null,
    subtitle: djCardSubtitle({
      setCount: dj.setCount,
      owned: owned.get(dj.key) ?? null,
    }),
  }))
  const onlyOnSpotify = newOnSpotify(shown, spotify, MAX_SPOTIFY_CARDS).map(
    (artist) => ({
      key: `spotify:${artist.id}`,
      name: artist.name,
      spotifyArtistId: artist.id,
      imageUrl: artist.imageUrl,
      subtitle: djCardSubtitle('spotify'),
    }),
  )
  return [...known, ...onlyOnSpotify]
}

/**
 * "You own N" for a DJ whose page was opened before (its tracks are cached),
 * counted as the page counts it: Owned only, a Maybe answered Yes included.
 * Null — no number — when nothing is cached, or while the library index is
 * still empty (every track would read Missing).
 */
export function cachedOwned(
  tracks: DjTrack[] | undefined,
  index: OwnershipIndex,
  verdicts: SpotifyVerdict[],
): number | null {
  if (!tracks || tracks.length === 0 || index.entries.length === 0) return null
  let owned = 0
  for (const ownership of classifyTracks(
    tracks.map(asSpotifyTrack),
    index,
    verdicts,
  ).values()) {
    if (ownership.kind === 'owned') owned += 1
  }
  return owned
}
