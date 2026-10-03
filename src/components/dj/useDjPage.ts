// src/components/dj/useDjPage.ts
// Everything a DJ page shows, and what it can do. The cached page arrives at
// once; Spotify and RA are refreshed in parallel (each only when stale — Rust
// decides) and the page is read again after each, and after every batch of
// releases a first Spotify fetch reports.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import { djKey, setsOfDj } from '../../lib/dj/names'
import { countPlays, type Play } from '../../lib/dj/plays'
import { REFRESHING, sourceAfter, type DjSourceStatus } from '../../lib/dj/page'
import { getErrorMessage } from '../../types/ai'
import type { YtSetSummary } from '../../types/youtube'
import {
  DJ_TRACKS_PROGRESS_EVENT,
  type DjCandidates,
  type DjPage,
  type DjRefresh,
  type DjTracksProgress,
  type RaPick,
} from '../../types/dj'

export interface DjPageState {
  /** djKey(name): the page's key. */
  nameKey: string
  /** The cached page; null until it has been read once. */
  page: DjPage | null
  /** Reading the cached page failed (the database, not Spotify or RA). */
  loadError: string | null
  /** Their saved sets, as the Sets library lists them; null while loading. */
  sets: YtSetSummary[] | null
  /** What they play across those sets, most-played first; null while loading. */
  plays: Play[] | null
  /** On the watched-DJ list; null until known. */
  watched: boolean | null
  spotify: DjSourceStatus
  ra: DjSourceStatus
  /** The running Spotify fetch's releases, from `dj-tracks-progress`; null when none reported. */
  progress: { done: number; total: number } | null
  /** "Load older releases" is running. */
  loadingOlder: boolean
  /** "Not this artist?": the search results per source; null until asked. */
  candidates: DjCandidates | null
  candidatesLoading: boolean
  candidatesError: string | null
}

export interface DjPageData extends DjPageState {
  toggleWatch: () => void
  /** The next 150 appears-on / compilation releases, then the page again. */
  loadOlder: () => void
  /** Asks both sources for this name's artists (the ⋯ menu, when it opens). */
  loadCandidates: () => void
  /** A manual Spotify artist; null = "none". Re-runs the Spotify refresh. */
  pickSpotify: (artistId: string | null) => void
  /** A manual RA artist; null = "none". Re-runs the RA refresh. */
  pickRa: (pick: RaPick | null) => void
}

function initial(nameKey: string): DjPageState {
  return {
    nameKey,
    page: null,
    loadError: null,
    sets: null,
    plays: null,
    watched: null,
    // Both refreshes start as the page opens.
    spotify: REFRESHING,
    ra: REFRESHING,
    progress: null,
    loadingOlder: false,
    candidates: null,
    candidatesLoading: false,
    candidatesError: null,
  }
}

type Patch =
  | Partial<DjPageState>
  | ((state: DjPageState) => Partial<DjPageState>)

function failedWith(e: unknown): DjSourceStatus {
  return { refreshing: false, outcome: 'failed', error: getErrorMessage(e) }
}

/**
 * @param name the DJ's name as clicked.
 * @param spotifyArtistId set when the page was opened from a Spotify search
 *   card: stored as the manual match before anything resolves.
 */
export function useDjPage(
  name: string,
  spotifyArtistId: string | null,
): DjPageData {
  const nameKey = djKey(name)
  const [state, setState] = useState<DjPageState>(() => initial(nameKey))

  /** The key on screen; null after unmount. Answers for any other key are dropped. */
  const current = useRef<string | null>(null)
  /** Counts Spotify / RA runs, so only the latest run's answer is kept. */
  const spotifyRun = useRef(0)
  const raRun = useRef(0)

  useEffect(() => {
    current.current = nameKey
    return () => {
      current.current = null
    }
  }, [nameKey])

  // Every update goes through here: dropped when the page is gone or shows
  // another DJ, and the first update for a new DJ starts from a clean state.
  const patch = useCallback((key: string, update: Patch) => {
    if (current.current !== key) return
    setState((prev) => {
      const base = prev.nameKey === key ? prev : initial(key)
      return {
        ...base,
        ...(typeof update === 'function' ? update(base) : update),
      }
    })
  }, [])

  const reload = useCallback(
    (key: string, djName: string) =>
      tauriApi
        .getDjPage(djName)
        .then((page) => patch(key, { page, loadError: null }))
        .catch((e) => patch(key, { loadError: getErrorMessage(e) })),
    [patch],
  )

  /** A Spotify fetch: its answer (if still the latest run) and the page read again. */
  const runSpotify = useCallback(
    (
      key: string,
      djName: string,
      fetch: () => Promise<DjRefresh>,
      extra: Partial<DjPageState> = {},
    ) => {
      const run = ++spotifyRun.current
      const done = (spotify: DjSourceStatus) => {
        if (run === spotifyRun.current)
          patch(key, { spotify, progress: null, ...extra })
        // A newer run owns the status, but this run's Load-older is over.
        else if (extra.loadingOlder === false)
          patch(key, { loadingOlder: false })
        return reload(key, djName)
      }
      return fetch().then(
        (result) => done(sourceAfter(result)),
        (e) => done(failedWith(e)),
      )
    },
    [patch, reload],
  )

  const runRa = useCallback(
    (key: string, djName: string) => {
      const run = ++raRun.current
      const done = (ra: DjSourceStatus) => {
        if (run === raRun.current) patch(key, { ra })
        return reload(key, djName)
      }
      return tauriApi.refreshDjGigs(djName).then(
        (result) => done(sourceAfter(result)),
        (e) => done(failedWith(e)),
      )
    },
    [patch, reload],
  )

  // Opening the page: a Spotify card's artist first, then the cache, then
  // both refreshes side by side. No setState here: the initial state already
  // says both are refreshing.
  useEffect(() => {
    const picked = spotifyArtistId
      ? tauriApi.setDjSpotifyArtist(name, spotifyArtistId).catch(() => {})
      : Promise.resolve()
    void picked.then(() => {
      // Gone, or showing another DJ: start nothing (a run would outrank the new page's).
      if (current.current !== nameKey) return
      void reload(nameKey, name)
      void runSpotify(nameKey, name, () => tauriApi.refreshDjSpotify(name))
      void runRa(nameKey, name)
    })
  }, [name, nameKey, spotifyArtistId, reload, runSpotify, runRa])

  // A first fetch of a big discography: progress per batch, and its tracks as they land.
  useEffect(() => {
    const stop = listen<DjTracksProgress>(DJ_TRACKS_PROGRESS_EVENT, (event) => {
      if (event.payload.nameKey !== nameKey) return
      patch(nameKey, {
        progress: { done: event.payload.done, total: event.payload.total },
      })
      void reload(nameKey, name)
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [name, nameKey, patch, reload])

  // Their saved sets (the Sets library, split b2b), then what those sets contain.
  useEffect(() => {
    tauriApi
      .listYouTubeSets()
      .then((all) => {
        const sets = setsOfDj(all, nameKey)
        patch(nameKey, { sets })
        if (sets.length === 0) return patch(nameKey, { plays: [] })
        return tauriApi
          .getYtTracksForSets(sets.map((set) => set.video_id))
          .then((rows) => patch(nameKey, { plays: countPlays(rows) }))
      })
      .catch(() =>
        patch(nameKey, (state) => ({
          sets: state.sets ?? [],
          plays: state.plays ?? [],
        })),
      )
  }, [nameKey, patch])

  useEffect(() => {
    tauriApi
      .listYouTubeDjs()
      .then((list) =>
        patch(nameKey, { watched: list.some((dj) => dj.name_key === nameKey) }),
      )
      .catch(() => {})
  }, [nameKey, patch])

  const watched = state.nameKey === nameKey ? state.watched : null
  const toggleWatch = useCallback(() => {
    if (watched === null) return
    const change = watched
      ? tauriApi.unwatchYouTubeDj(nameKey)
      : tauriApi.watchYouTubeDj(name)
    change.then(() => patch(nameKey, { watched: !watched })).catch(() => {})
  }, [name, nameKey, watched, patch])

  const loadOlder = useCallback(() => {
    patch(nameKey, { loadingOlder: true, spotify: REFRESHING, progress: null })
    void runSpotify(nameKey, name, () => tauriApi.loadOlderDjReleases(name), {
      loadingOlder: false,
    })
  }, [name, nameKey, patch, runSpotify])

  const loadCandidates = useCallback(() => {
    patch(nameKey, { candidatesLoading: true, candidatesError: null })
    tauriApi
      .djArtistCandidates(name)
      .then((candidates) =>
        patch(nameKey, { candidates, candidatesLoading: false }),
      )
      .catch((e) =>
        patch(nameKey, {
          candidatesLoading: false,
          candidatesError: getErrorMessage(e),
        }),
      )
  }, [name, nameKey, patch])

  const pickSpotify = useCallback(
    (artistId: string | null) => {
      patch(nameKey, { spotify: REFRESHING, progress: null })
      void runSpotify(nameKey, name, () =>
        // A different artist clears the old tracks: show that at once.
        tauriApi.setDjSpotifyArtist(name, artistId).then(() => {
          void reload(nameKey, name)
          return tauriApi.refreshDjSpotify(name)
        }),
      )
    },
    [name, nameKey, patch, reload, runSpotify],
  )

  const pickRa = useCallback(
    (pick: RaPick | null) => {
      patch(nameKey, { ra: REFRESHING })
      tauriApi
        .setDjRaArtist(name, pick)
        .then(() => {
          void reload(nameKey, name)
          return runRa(nameKey, name)
        })
        .catch((e) => patch(nameKey, { ra: failedWith(e) }))
    },
    [name, nameKey, patch, reload, runRa],
  )

  return useMemo(
    () => ({
      ...(state.nameKey === nameKey ? state : initial(nameKey)),
      toggleWatch,
      loadOlder,
      loadCandidates,
      pickSpotify,
      pickRa,
    }),
    [
      state,
      nameKey,
      toggleWatch,
      loadOlder,
      loadCandidates,
      pickSpotify,
      pickRa,
    ],
  )
}
