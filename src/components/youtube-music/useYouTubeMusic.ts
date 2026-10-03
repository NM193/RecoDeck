// src/components/youtube-music/useYouTubeMusic.ts
// Everything the YouTube Music section shows, loaded once and kept current.
// Called from App.tsx, like useSpotify, so the sidebar's number is right in
// every view. Matching uses the library index useSpotify already holds: App
// calls useYouTubeMusic, then useSpotify (asking it for the library while
// YouTube Music is shown), then useYouTubeMusicMatches.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { tauriApi } from '../../lib/tauri-api'
import type { Ownership } from '../../lib/spotify/ownership'
import type { NewCounts } from '../../lib/spotify/newness'
import type { StatusFilter } from '../../lib/spotify/rows'
import { classifyYouTubeMusic, listCounts } from '../../lib/youtube-music/rows'
import { newAndMissing } from '../../lib/youtube-music/newness'
import type { SpotifyData } from '../spotify/useSpotify'
import type { Verdict } from '../../types/spotify'
import {
  ALL_YTM_LISTS,
  YTM_SYNCED_EVENT,
  type YtmLibrary,
  type YtmStatus,
  type YtmSynced,
} from '../../types/youtubeMusic'

const EMPTY: YtmLibrary = { lists: [], tracks: [], entries: [], verdicts: [] }

export interface YouTubeMusicData {
  status: YtmStatus | null
  connected: boolean
  library: YtmLibrary
  /** Each list's lastOpenedAt as it was when the open view was opened: what the dots compare with. */
  seenBefore: Map<string, number>
  syncing: boolean
  /** Remembered for the session; All by default. */
  filter: StatusFilter
  setFilter: (filter: StatusFilter) => void
  openList: (listId: string) => void
  syncNow: () => void
  /** Rejects when the answer could not be saved. */
  setVerdict: (videoId: string, libraryTrackId: number, verdict: Verdict) => Promise<void>
  /** Rejects with the error when the login fails. */
  reconnect: () => Promise<void>
  /** Rejects with the line the field shows ("Not found — …"). The rows arrive by event. */
  addPlaylist: (link: string) => Promise<void>
  removePlaylist: (listId: string) => Promise<void>
}

export interface YouTubeMusicMatches {
  /** Keyed by video id; sets are not in it. */
  ownership: Map<string, Ownership>
  newCounts: NewCounts
  /** Tracks behind each sidebar item, plus ALL_YTM_LISTS; sets left out. */
  counts: Map<string, number>
}

/** @param ready the database is open (App's start-up has finished). */
export function useYouTubeMusic(ready: boolean): YouTubeMusicData {
  const [status, setStatus] = useState<YtmStatus | null>(null)
  const [library, setLibrary] = useState<YtmLibrary>(EMPTY)
  const [seenBefore, setSeenBefore] = useState<Map<string, number>>(
    () => new Map(),
  )
  const [syncing, setSyncing] = useState(false)
  /** Counts the times the account became connected — each one loads the rows. */
  const [connections, setConnections] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const connected = status?.connected ?? false

  // As in useSpotify: only the newest load may land, so a load read before a
  // local write (opening a list, an answer) never undoes it.
  const loadSeq = useRef(0)
  const loadPending = useRef(false)
  const wasConnected = useRef(false)

  const loadLibrary = useCallback(() => {
    const seq = ++loadSeq.current
    loadPending.current = true
    tauriApi
      .getYouTubeMusicLibrary()
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

  const applyStatus = useCallback((next: YtmStatus) => {
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

  const refresh = useCallback(
    (reloadData: boolean) => {
      tauriApi
        .getYouTubeMusicStatus()
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

  // Whenever the account becomes connected: at start-up, after Connect, or
  // after reconnecting, when the rows stayed on disk.
  useEffect(() => {
    if (ready && connected) loadLibrary()
  }, [ready, connected, connections, loadLibrary])

  // Every sync reports, and so do adding or removing a playlist and the
  // switch: the status always, the rows when something changed.
  useEffect(() => {
    const stop = listen<YtmSynced>(YTM_SYNCED_EVENT, (event) => {
      setSyncing(false)
      refresh(event.payload.changed)
    })
    return () => {
      void stop.then((unlisten) => unlisten())
    }
  }, [refresh])

  const openList = useCallback(
    (listId: string) => {
      // Captured before the opening is written, so the dots are seen once.
      setSeenBefore(
        new Map(library.lists.map((list) => [list.id, list.lastOpenedAt])),
      )
      tauriApi
        .markYouTubeMusicListOpened(listId)
        .then((at) => {
          setLibrary((prev) => ({
            ...prev,
            lists: prev.lists.map((list) =>
              listId === ALL_YTM_LISTS || list.id === listId
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
      .syncYouTubeMusicNow()
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [])

  const setVerdict = useCallback(
    (videoId: string, libraryTrackId: number, verdict: Verdict) =>
      tauriApi
        .setYouTubeMusicVerdict(videoId, libraryTrackId, verdict)
        .then(() => {
          setLibrary((prev) => ({
            ...prev,
            verdicts: [
              ...prev.verdicts.filter(
                (v) =>
                  !(v.videoId === videoId && v.libraryTrackId === libraryTrackId),
              ),
              { videoId, libraryTrackId, verdict },
            ],
          }))
          supersedeLoad()
        }),
    [supersedeLoad],
  )

  const reconnect = useCallback(async () => {
    applyStatus(await tauriApi.connectYouTubeMusic())
  }, [applyStatus])

  const addPlaylist = useCallback(
    (link: string) => tauriApi.addYouTubeMusicPlaylist(link),
    [],
  )

  const removePlaylist = useCallback(
    (listId: string) => tauriApi.removeYouTubeMusicPlaylist(listId),
    [],
  )

  return {
    status,
    connected,
    library,
    seenBefore,
    syncing,
    filter,
    setFilter,
    openList,
    syncNow,
    setVerdict,
    reconnect,
    addPlaylist,
    removePlaylist,
  }
}

/**
 * Ownership and the counts, against useSpotify's library index. No number
 * before the library has loaded once: every track would count as Missing.
 */
export function useYouTubeMusicMatches(
  library: YtmLibrary,
  matcher: Pick<SpotifyData, 'index' | 'libraryLoaded'>,
): YouTubeMusicMatches {
  const { index, libraryLoaded } = matcher
  const ownership = useMemo(
    () => classifyYouTubeMusic(library.tracks, index, library.verdicts),
    [library.tracks, library.verdicts, index],
  )
  const newCounts = useMemo(
    () =>
      libraryLoaded
        ? newAndMissing(library, ownership)
        : { total: 0, byList: new Map<string, number>() },
    [libraryLoaded, library, ownership],
  )
  const counts = useMemo(() => listCounts(library), [library])
  return useMemo(
    () => ({ ownership, newCounts, counts }),
    [ownership, newCounts, counts],
  )
}
