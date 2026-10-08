// src/components/home/useHomeData.ts
// What the cards on Home read (Home cards spec, Data), all local: when Home
// opens, when a card that needs something new is added, and each time App's
// data-version number changes (a play, an analysis, a rescan, a move); with
// Last playlist on Home, when a playlist changes too. Each part is null until
// it is read, so a card shows nothing rather than its empty text for a
// moment; what was read stays while it is read again.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import { localDay } from '../../lib/dj/gigs'
import { orderYourDjs } from '../../lib/dj/recent'
import { loadDjRecent } from '../../lib/search/storage'
import { YOUR_DJS_MAX } from '../search/useSectionsData'
import type { BpmKeyCounts, UpcomingGig } from '../../types/home'
import type { LibraryGroups, RecentlyPlayedTrack, YourDj } from '../../types/sections'
import type { Track } from '../../types/track'

/** The most rows a list card reads. */
export const RECENTLY_PLAYED_ROWS = 20
export const RECENTLY_ADDED_ROWS = 20
export const UPCOMING_GIGS_ROWS = 20

/** The playlist played from last, and every track in it. */
export interface LastPlaylist {
  id: number
  name: string
  /** Unix seconds. */
  playedAt: number
  tracks: Track[]
}

export interface HomeData {
  recentlyPlayed: RecentlyPlayedTrack[] | null
  recentlyAdded: Track[] | null
  /** The DJs opened most recently first, as on Search. */
  djs: YourDj[] | null
  gigs: UpcomingGig[] | null
  groups: LibraryGroups | null
  bpmKey: BpmKeyCounts | null
  /** The tracks with no BPM. */
  withoutBpm: number[] | null
  /** 'none' when no play came from a playlist that still exists. */
  lastPlaylist: LastPlaylist | 'none' | null
  /** The local day the gigs were read for ("2026-10-08"). */
  today: string
}

type Part =
  | 'recentlyPlayed'
  | 'recentlyAdded'
  | 'djs'
  | 'gigs'
  | 'groups'
  | 'bpmKey'
  | 'withoutBpm'
  | 'lastPlaylist'

/** What each card reads. New likes reads nothing: App passes its numbers. */
const PARTS: Record<string, Part[]> = {
  'recently-played': ['recentlyPlayed'],
  'recently-added': ['recentlyAdded'],
  'your-djs': ['djs'],
  'needs-you': ['gigs', 'withoutBpm'],
  'upcoming-gigs': ['gigs'],
  'library-stats': ['groups'],
  'library-by-genre': ['groups'],
  'bpm-key': ['bpmKey'],
  'not-analyzed': ['withoutBpm'],
  'quick-actions': ['withoutBpm'],
  'last-playlist': ['lastPlaylist'],
}

const NO_GROUPS: LibraryGroups = { genres: [], addedRecently: 0, neverPlayed: 0 }
const NO_COUNTS: BpmKeyCounts = { bpm: [], keys: [] }

async function readLastPlaylist(): Promise<LastPlaylist | 'none'> {
  const last = await tauriApi.getLastPlayedPlaylist()
  if (!last) return 'none'
  // Its tracks unread, the card still names the playlist.
  const tracks = await tauriApi.getPlaylistTracks(last.playlistId).catch((err) => {
    console.warn('[Home] Failed to read the last playlist\'s tracks:', err)
    return []
  })
  return { id: last.playlistId, name: last.name, playedAt: last.playedAt, tracks }
}

// One part's read: null when no card needs it; a failure reads as empty.
async function read<T>(wanted: boolean, empty: T, load: () => Promise<T>): Promise<T | null> {
  if (!wanted) return null
  try {
    return await load()
  } catch (err) {
    console.warn('[Home] Failed to read a card:', err)
    return empty
  }
}

/**
 * `playlistsKey` changes when a playlist is renamed or its tracks change
 * (App's playlists); with Last playlist on Home, the cards read again then
 * (the reads are cheap).
 */
export function useHomeData(cardIds: readonly string[], version: number, playlistsKey: string): HomeData {
  const [data, setData] = useState<HomeData>({
    recentlyPlayed: null,
    recentlyAdded: null,
    djs: null,
    gigs: null,
    groups: null,
    bpmKey: null,
    withoutBpm: null,
    lastPlaylist: null,
    today: localDay(new Date()),
  })
  // A string, so moving or resizing a card reads nothing again.
  const partsKey = [...new Set(cardIds.flatMap((id) => PARTS[id] ?? []))].sort().join(',')
  const lastPlaylistKey = partsKey.split(',').includes('lastPlaylist') ? playlistsKey : ''

  useEffect(() => {
    let current = true
    const wanted = new Set(partsKey.split(','))
    const today = localDay(new Date())
    Promise.all([
      read(wanted.has('recentlyPlayed'), [], () => tauriApi.getRecentlyPlayedTracks(RECENTLY_PLAYED_ROWS)),
      read(wanted.has('recentlyAdded'), [], () => tauriApi.getRecentlyAddedTracks(RECENTLY_ADDED_ROWS)),
      read(wanted.has('djs'), [], async () =>
        orderYourDjs(await tauriApi.getKnownDjs(today), loadDjRecent()).slice(0, YOUR_DJS_MAX),
      ),
      read(wanted.has('gigs'), [], () => tauriApi.getUpcomingGigs(today, UPCOMING_GIGS_ROWS)),
      read(wanted.has('groups'), NO_GROUPS, () => tauriApi.getLibraryGroups()),
      read(wanted.has('bpmKey'), NO_COUNTS, () => tauriApi.getBpmKeyCounts()),
      read(wanted.has('withoutBpm'), [], () => tauriApi.getTrackIdsWithoutBpm()),
      read<LastPlaylist | 'none'>(wanted.has('lastPlaylist'), 'none', readLastPlaylist),
    ]).then(([recentlyPlayed, recentlyAdded, djs, gigs, groups, bpmKey, withoutBpm, lastPlaylist]) => {
      if (current) {
        setData({ recentlyPlayed, recentlyAdded, djs, gigs, groups, bpmKey, withoutBpm, lastPlaylist, today })
      }
    })
    return () => {
      current = false
    }
  }, [partsKey, version, lastPlaylistKey])

  return data
}
