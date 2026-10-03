// Search's DJs row: the DJs the user knows as they type (no network), then
// Spotify's artists for the query once typing pauses, with "you own N" for the
// DJs whose page was opened before.
import { useEffect, useMemo, useRef, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import { findKnownDjs, knownDjs, type KnownDj } from '../../lib/dj/names'
import {
  cachedOwned,
  djSearchCards,
  type DjSearchCard,
} from '../../lib/dj/search'
import type { SpotifyData } from '../spotify/useSpotify'
import type { ArtistCandidate, DjTrack } from '../../types/dj'

/** Spotify is asked only once typing has paused this long. */
const SPOTIFY_DEBOUNCE_MS = 300

/** search_spotify_artists answers nothing below two characters, so it is not asked. */
const MIN_SPOTIFY_QUERY = 2

/** One empty list, so the cards are not rebuilt on every render while Spotify has no answer. */
const NO_ARTISTS: ArtistCandidate[] = []

/**
 * @param query  Search's box, as typed.
 * @param spotify App's `useSpotify`: `connected` gates the Spotify search;
 *   `index` and the verdicts count "you own N" as the DJ page does.
 */
export function useDjSearch(
  query: string,
  spotify: Pick<SpotifyData, 'connected' | 'index' | 'library'>,
): DjSearchCard[] {
  const { connected, index } = spotify
  const verdicts = spotify.library.verdicts
  const [known, setKnown] = useState<KnownDj[]>([])
  /** Spotify's answer and the query it answers: an answer to an older query is never shown. */
  const [found, setFound] = useState<{
    query: string
    artists: ArtistCandidate[]
  }>({
    query: '',
    artists: [],
  })
  /** Cached tracks per name key, gathered as DJs show; keys never opened stay absent. */
  const [cached, setCached] = useState<Map<string, DjTrack[]>>(() => new Map())

  // Saved sets and watched DJs, once per visit to Search: both change only in Sets.
  useEffect(() => {
    let live = true
    Promise.all([tauriApi.listYouTubeSets(), tauriApi.listYouTubeDjs()])
      .then(([sets, watched]) => {
        if (live) setKnown(knownDjs(sets, watched))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const trimmed = query.trim()
  const shown = useMemo(() => findKnownDjs(known, trimmed), [known, trimmed])

  // Spotify, debounced. Cleaning up on the next keystroke both cancels a timer
  // not yet fired and silences a request already out, so answers never arrive
  // out of order.
  useEffect(() => {
    if (!connected || trimmed.length < MIN_SPOTIFY_QUERY) return
    let live = true
    const timer = setTimeout(() => {
      tauriApi
        .searchSpotifyArtists(trimmed)
        .then((artists) => {
          if (live) setFound({ query: trimmed, artists })
        })
        // Offline or rate-limited: the row keeps the known DJs.
        .catch(() => {
          if (live) setFound({ query: trimmed, artists: [] })
        })
    }, SPOTIFY_DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [connected, trimmed])

  /** Keys asked for (or being asked for): each is read once per visit to Search. */
  const asked = useRef(new Set<string>())

  // One string, so the effect runs when the shown DJs change, not on every render.
  // Only the new keys are read, debounced as Spotify is: typing narrows the row.
  const shownKeys = shown.map((dj) => dj.key).join('\n')
  useEffect(() => {
    if (!shownKeys) return
    const seen = asked.current
    const keys = shownKeys.split('\n').filter((key) => !seen.has(key))
    if (keys.length === 0) return
    let live = true
    /** Sent and not yet answered: cleaning up now drops the answer. */
    let pending = false
    const timer = setTimeout(() => {
      pending = true
      for (const key of keys) seen.add(key)
      tauriApi
        .getDjCachedTracks(keys)
        .then((byKey) => {
          if (!live) return
          pending = false
          setCached((prev) => {
            const next = new Map(prev)
            for (const [key, tracks] of Object.entries(byKey))
              next.set(key, tracks)
            return next
          })
        })
        .catch(() => {
          pending = false
          for (const key of keys) seen.delete(key)
        })
    }, SPOTIFY_DEBOUNCE_MS)
    return () => {
      live = false
      clearTimeout(timer)
      // An answer that will be dropped: those keys are asked for again.
      if (pending) for (const key of keys) seen.delete(key)
    }
  }, [shownKeys])

  const artists =
    connected && found.query === trimmed ? found.artists : NO_ARTISTS

  return useMemo(() => {
    const owned = new Map<string, number>()
    for (const dj of shown) {
      const count = cachedOwned(cached.get(dj.key), index, verdicts)
      if (count !== null) owned.set(dj.key, count)
    }
    return djSearchCards(shown, artists, owned)
  }, [shown, artists, cached, index, verdicts])
}
