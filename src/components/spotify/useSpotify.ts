// Everything the Spotify section shows, loaded once and kept current. Called
// from App.tsx so the sidebar's new-likes number is right in every view.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import {
  buildOwnershipIndex,
  classifyTracks,
  type Ownership,
  type OwnershipIndex,
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
  /** The library index every ownership check shares (Spotify lists, DJ pages, Search). */
  index: OwnershipIndex
  /** False until the library has arrived once: until then every row would read Missing. */
  libraryLoaded: boolean
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
  /** Rejects when the answer could not be saved. */
  setVerdict: (
    spotifyId: string,
    libraryTrackId: number,
    verdict: Verdict,
  ) => Promise<void>
  /** Rejects with the error when the login fails. */
  reconnect: () => Promise<void>
}

/** The library reads for matching: one at a time, a change during a read asks for one more. */
interface TracksLoad {
  /** The account is connected and the hook mounted. */
  live: boolean
  inFlight: boolean
  /** library-changed arrived during a read. */
  again: boolean
  /** App's track count moved during a read. */
  countMoved: boolean
  /** Tracks in the last read; -1 before the first. */
  loadedCount: number
  /** App's latest track count. */
  count: number
}

function readAllTracks(
  state: TracksLoad,
  apply: (tracks: Track[]) => void,
): void {
  if (state.inFlight) {
    state.again = true
    return
  }
  state.inFlight = true
  state.again = false
  state.countMoved = false
  const done = (tracks: Track[] | null) => {
    state.inFlight = false
    if (!state.live) return
    if (tracks) {
      state.loadedCount = tracks.length
      apply(tracks)
    }
    const stale =
      state.again || (state.countMoved && state.loadedCount !== state.count)
    if (stale) readAllTracks(state, apply)
  }
  tauriApi
    .getAllTracks()
    .then(done)
    .catch(() => done(null))
}

/**
 * @param ready the database is open (App's start-up has finished).
 * @param totalTrackCount App's library count — a change means the library changed.
 * @param wantLibrary load the library even without Spotify (a DJ page's Plays needs it).
 */
export function useSpotify(
  ready: boolean,
  totalTrackCount: number,
  wantLibrary: boolean,
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
  /** Counts the times the account became connected — each one loads the rows. */
  const [connections, setConnections] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const connected = status?.connected ?? false
  // One flag, so opening a DJ page while connected does not reload the library.
  const needLibrary = connected || wantLibrary

  // Each load of the Spotify data gets a number; only the newest may land, so a
  // load read before a local write (opening a list, an answer) never undoes it.
  const loadSeq = useRef(0)
  const loadPending = useRef(false)
  /** The status's connected as last applied — refresh reads it without a render. */
  const wasConnected = useRef(false)

  const loadLibrary = useCallback(() => {
    const seq = ++loadSeq.current
    loadPending.current = true
    tauriApi
      .getSpotifyLibrary()
      .then((next) => {
        if (seq !== loadSeq.current) return
        loadPending.current = false
        setLibrary(next)
      })
      .catch(() => {
        if (seq === loadSeq.current) loadPending.current = false
      })
  }, [])

  /** A local write landed: a load still in flight read the old rows, so read again. */
  const supersedeLoad = useCallback(() => {
    if (loadPending.current) loadLibrary()
  }, [loadLibrary])

  const applyStatus = useCallback((next: SpotifyStatus) => {
    const was = wasConnected.current
    wasConnected.current = next.connected
    setStatus(next)
    if (!was && next.connected) setConnections((n) => n + 1)
    if (!next.connected) {
      // Drop any load in flight: its rows belong to the account that left.
      loadSeq.current++
      loadPending.current = false
      setLibrary(EMPTY)
    }
    return was
  }, [])

  /**
   * Status first. The rows reload here only when the account was already
   * connected; becoming connected loads them in the effect below.
   */
  const refresh = useCallback(
    (reloadData: boolean) => {
      tauriApi
        .getSpotifyStatus()
        .then((next) => {
          const was = applyStatus(next)
          if (reloadData && was && next.connected) loadLibrary()
        })
        .catch(() => {})
    },
    [applyStatus, loadLibrary],
  )

  useEffect(() => {
    if (ready) refresh(false)
  }, [ready, refresh])

  // Whenever the account becomes connected — at start-up, after Connect, or
  // after reconnecting the same account, whose rows stayed on disk. Counting
  // the connections also catches a disconnect and reconnect within one render.
  useEffect(() => {
    if (ready && connected) loadLibrary()
  }, [ready, connected, connections, loadLibrary])

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
  const tracksLoad = useRef<TracksLoad>({
    live: false,
    inFlight: false,
    again: false,
    countMoved: false,
    loadedCount: -1,
    count: totalTrackCount,
  })

  const loadTracks = useCallback(() => {
    readAllTracks(tracksLoad.current, (tracks) => {
      setLibraryTracks(tracks)
      setLibraryLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!ready || !needLibrary) return
    const state = tracksLoad.current
    state.live = true
    loadTracks()
    const stop = listen('library-changed', loadTracks)
    return () => {
      state.live = false
      void stop.then((unlisten) => unlisten())
    }
  }, [ready, needLibrary, loadTracks])

  // App's count moved: read again only if it disagrees with what was read. At
  // start-up the count arrives while the first read is running, which already
  // holds the new tracks — so no second read.
  useEffect(() => {
    tracksLoad.current.count = totalTrackCount
    if (!ready || !needLibrary) return
    const state = tracksLoad.current
    if (state.inFlight) state.countMoved = true
    else if (state.loadedCount !== totalTrackCount) loadTracks()
  }, [ready, needLibrary, totalTrackCount, loadTracks])

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
          supersedeLoad()
        })
        .catch(() => {})
    },
    [library.lists, supersedeLoad],
  )

  const syncNow = useCallback(() => {
    setSyncing(true)
    tauriApi
      .syncSpotifyNow()
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [])

  const setVerdict = useCallback(
    (spotifyId: string, libraryTrackId: number, verdict: Verdict) =>
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
          supersedeLoad()
        }),
    [supersedeLoad],
  )

  const reconnect = useCallback(async () => {
    applyStatus(await tauriApi.connectSpotify())
  }, [applyStatus])

  return {
    status,
    connected,
    library,
    libraryTracks,
    libraryLoaded,
    index,
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
