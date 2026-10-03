// Everything the Spotify section shows, loaded once and kept current. Called
// from App.tsx so the sidebar's new-likes number is right in every view.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import {
  buildOwnershipIndex,
  classifyTracks,
  type Ownership,
} from '../../lib/spotify/ownership'
import { newAndMissing, type NewCounts } from '../../lib/spotify/newness'
import { listCounts, type StatusFilter } from '../../lib/spotify/rows'
import type { Track } from '../../types/track'
import {
  ALL_LISTS,
  SPOTIFY_SYNCED_EVENT,
  type SpotifyLibrary,
  type SpotifyStatus,
  type SpotifySynced,
  type Verdict,
} from '../../types/spotify'

const EMPTY: SpotifyLibrary = {
  lists: [],
  tracks: [],
  entries: [],
  verdicts: [],
}

export interface SpotifyData {
  status: SpotifyStatus | null
  connected: boolean
  library: SpotifyLibrary
  /** The whole RecoDeck library — App only holds the view on screen. */
  libraryTracks: Track[]
  ownership: Map<string, Ownership>
  newCounts: NewCounts
  /** Rows behind each sidebar item, plus ALL_LISTS. */
  counts: Map<string, number>
  /** Each list's lastOpenedAt as it was when the open view was opened: what the dots compare with. */
  seenBefore: Map<string, number>
  syncing: boolean
  /** Remembered for the session; All by default. */
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  openList: (listId: string) => void
  syncNow: () => void
  setVerdict: (
    spotifyId: string,
    libraryTrackId: number,
    verdict: Verdict,
  ) => void
  /** Rejects with the error when the login fails. */
  reconnect: () => Promise<void>
}

/**
 * @param ready the database is open (App's start-up has finished).
 * @param totalTrackCount App's library count — a change means the library changed.
 */
export function useSpotify(
  ready: boolean,
  totalTrackCount: number,
): SpotifyData {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)
  const [library, setLibrary] = useState<SpotifyLibrary>(EMPTY)
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([])
  /** Until the library has arrived once, everything would read Missing. */
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [seenBefore, setSeenBefore] = useState<Map<string, number>>(
    () => new Map(),
  )
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const connected = status?.connected ?? false

  const loadLibrary = useCallback(() => {
    tauriApi
      .getSpotifyLibrary()
      .then(setLibrary)
      .catch(() => {})
  }, [])

  /** Status first; the data only when there is an account. */
  const refresh = useCallback(
    (reloadData: boolean) => {
      tauriApi
        .getSpotifyStatus()
        .then((next) => {
          setStatus(next)
          if (!next.connected) setLibrary(EMPTY)
          else if (reloadData) loadLibrary()
        })
        .catch(() => {})
    },
    [loadLibrary],
  )

  useEffect(() => {
    if (ready) refresh(true)
  }, [ready, refresh])

  // Every sync reports, changed or not: the "synced …" line and the Reconnect
  // bar read the status, the rows only when something changed.
  useEffect(() => {
    const stop = listen<SpotifySynced>(SPOTIFY_SYNCED_EVENT, (event) => {
      setSyncing(false)
      refresh(event.payload.changed)
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refresh])

  // The whole library, for matching — only while there is something to match.
  useEffect(() => {
    if (!ready || !connected) return
    let live = true
    const load = () => {
      tauriApi
        .getAllTracks()
        .then((tracks) => {
          if (!live) return
          setLibraryTracks(tracks)
          setLibraryLoaded(true)
        })
        .catch(() => {})
    }
    load()
    const stop = listen('library-changed', load)
    return () => {
      live = false
      void stop.then((unlisten) => unlisten())
    }
  }, [ready, connected, totalTrackCount])

  const index = useMemo(
    () => buildOwnershipIndex(libraryTracks),
    [libraryTracks],
  )
  const ownership = useMemo(
    () => classifyTracks(library.tracks, index, library.verdicts),
    [library.tracks, library.verdicts, index],
  )
  // No number before the library is known: owned tracks would count as missing.
  const newCounts = useMemo(
    () =>
      libraryLoaded
        ? newAndMissing(library, ownership)
        : { total: 0, byList: new Map<string, number>() },
    [libraryLoaded, library, ownership],
  )
  const counts = useMemo(() => listCounts(library), [library])

  const openList = useCallback(
    (listId: string) => {
      // Captured before the opening is written, so the dots are seen once.
      setSeenBefore(
        new Map(library.lists.map((list) => [list.id, list.lastOpenedAt])),
      )
      tauriApi
        .markSpotifyListOpened(listId)
        .then((at) => {
          setLibrary((prev) => ({
            ...prev,
            lists: prev.lists.map((list) =>
              listId === ALL_LISTS || list.id === listId
                ? { ...list, lastOpenedAt: at }
                : list,
            ),
          }))
        })
        .catch(() => {})
    },
    [library.lists],
  )

  const syncNow = useCallback(() => {
    setSyncing(true)
    tauriApi
      .syncSpotifyNow()
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [])

  const setVerdict = useCallback(
    (spotifyId: string, libraryTrackId: number, verdict: Verdict) => {
      tauriApi
        .setSpotifyVerdict(spotifyId, libraryTrackId, verdict)
        .then(() => {
          setLibrary((prev) => ({
            ...prev,
            verdicts: [
              ...prev.verdicts.filter(
                (v) =>
                  !(
                    v.spotifyId === spotifyId &&
                    v.libraryTrackId === libraryTrackId
                  ),
              ),
              { spotifyId, libraryTrackId, verdict },
            ],
          }))
        })
        .catch(() => {})
    },
    [],
  )

  const reconnect = useCallback(async () => {
    const next = await tauriApi.connectSpotify()
    setStatus(next)
  }, [])

  return {
    status,
    connected,
    library,
    libraryTracks,
    ownership,
    newCounts,
    counts,
    seenBefore,
    syncing,
    filter,
    setFilter,
    openList,
    syncNow,
    setVerdict,
    reconnect,
  }
}
