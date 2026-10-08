// src/components/search/useSectionsData.ts
// What the switched-on sections show (Search spec, Sections), all local:
// read when the Search page opens, when a section is switched on, after each
// play (Recently played and the Never played count change), and when the
// field is cleared again. Null until the first read answers, so the page does
// not flash "Search your library".
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import { localDay } from '../../lib/dj/gigs'
import { orderYourDjs } from '../../lib/dj/recent'
import { loadDjRecent } from '../../lib/search/storage'
import type { SearchSectionId } from '../../lib/search/sections'
import type { Track } from '../../types/track'
import type { YtSetSummary } from '../../types/youtube'
import type {
  LibraryGroups,
  RecentlyPlayedTrack,
  YourDj,
} from '../../types/sections'

export const RECENTLY_PLAYED_TILES = 6
export const RECENTLY_ADDED_ROWS = 6
export const SAVED_SET_ROWS = 3
/** Your DJs keeps to the 20 opened most recently, then by name. */
export const YOUR_DJS_MAX = 20

export interface SectionsData {
  recentlyPlayed: RecentlyPlayedTrack[]
  djs: YourDj[]
  groups: LibraryGroups | null
  recentlyAdded: Track[]
  savedSets: YtSetSummary[]
  /** The local day the DJs' next gigs were picked for ("2026-10-08"). */
  today: string
}

// One section's read; a failure shows that section empty.
async function read<T>(
  wanted: boolean,
  empty: T,
  load: () => Promise<T>,
): Promise<T> {
  if (!wanted) return empty
  try {
    return await load()
  } catch (err) {
    console.warn('[Search] Failed to read a section:', err)
    return empty
  }
}

/** `active` false (results on screen) reads nothing and keeps what was read. */
export function useSectionsData(
  shown: ReadonlyArray<SearchSectionId>,
  playVersion: number,
  active: boolean,
): SectionsData | null {
  const [data, setData] = useState<SectionsData | null>(null)
  // A string, so a new array with the same sections reads nothing again.
  const shownKey = [...shown].sort().join(',')

  useEffect(() => {
    if (!active) return
    let current = true
    const on = new Set(shownKey.split(','))
    const today = localDay(new Date())
    Promise.all([
      read(on.has('recently-played'), [], () =>
        tauriApi.getRecentlyPlayedTracks(RECENTLY_PLAYED_TILES),
      ),
      read(on.has('your-djs'), [], async () =>
        orderYourDjs(await tauriApi.getKnownDjs(today), loadDjRecent()).slice(
          0,
          YOUR_DJS_MAX,
        ),
      ),
      read(on.has('genres'), null, () => tauriApi.getLibraryGroups()),
      read(on.has('recently-added'), [], () =>
        tauriApi.getRecentlyAddedTracks(RECENTLY_ADDED_ROWS),
      ),
      read(on.has('saved-sets'), [], async () =>
        (await tauriApi.listYouTubeSets()).slice(0, SAVED_SET_ROWS),
      ),
    ]).then(([recentlyPlayed, djs, groups, recentlyAdded, savedSets]) => {
      if (current)
        setData({
          recentlyPlayed,
          djs,
          groups,
          recentlyAdded,
          savedSets,
          today,
        })
    })
    return () => {
      current = false
    }
  }, [shownKey, playVersion, active])

  return data
}
