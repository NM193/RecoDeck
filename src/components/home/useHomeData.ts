// src/components/home/useHomeData.ts
// What the cards on Home read (Home cards spec, Data), all local: when Home
// opens, when a card that needs something new is added, and each time App's
// data-version number changes (a play, an analysis, a rescan, a move). Each
// part is null until it is read, so a card shows nothing rather than its
// empty text for a moment; what was read stays while it is read again.
import { useEffect, useState } from 'react'
import { tauriApi } from '../../lib/tauri-api'
import { localDay } from '../../lib/dj/gigs'
import type { UpcomingGig } from '../../types/home'
import type { LibraryGroups, RecentlyPlayedTrack } from '../../types/sections'

/** The most rows a list card reads. */
export const RECENTLY_PLAYED_ROWS = 20
export const UPCOMING_GIGS_ROWS = 20

export interface HomeData {
  recentlyPlayed: RecentlyPlayedTrack[] | null
  gigs: UpcomingGig[] | null
  groups: LibraryGroups | null
  /** The tracks with no BPM. */
  withoutBpm: number[] | null
  /** The local day the gigs were read for ("2026-10-08"). */
  today: string
}

type Part = 'recentlyPlayed' | 'gigs' | 'groups' | 'withoutBpm'

/** What each card reads. */
const PARTS: Record<string, Part[]> = {
  'recently-played': ['recentlyPlayed'],
  'needs-you': ['gigs', 'withoutBpm'],
  'upcoming-gigs': ['gigs'],
  'library-stats': ['groups'],
  'library-by-genre': ['groups'],
  'not-analyzed': ['withoutBpm'],
  'quick-actions': ['withoutBpm'],
}

const NO_GROUPS: LibraryGroups = { genres: [], addedRecently: 0, neverPlayed: 0 }

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

export function useHomeData(cardIds: readonly string[], version: number): HomeData {
  const [data, setData] = useState<HomeData>({
    recentlyPlayed: null,
    gigs: null,
    groups: null,
    withoutBpm: null,
    today: localDay(new Date()),
  })
  // A string, so moving or resizing a card reads nothing again.
  const partsKey = [...new Set(cardIds.flatMap((id) => PARTS[id] ?? []))].sort().join(',')

  useEffect(() => {
    let current = true
    const wanted = new Set(partsKey.split(','))
    const today = localDay(new Date())
    Promise.all([
      read(wanted.has('recentlyPlayed'), [], () => tauriApi.getRecentlyPlayedTracks(RECENTLY_PLAYED_ROWS)),
      read(wanted.has('gigs'), [], () => tauriApi.getUpcomingGigs(today, UPCOMING_GIGS_ROWS)),
      read(wanted.has('groups'), NO_GROUPS, () => tauriApi.getLibraryGroups()),
      read(wanted.has('withoutBpm'), [], () => tauriApi.getTrackIdsWithoutBpm()),
    ]).then(([recentlyPlayed, gigs, groups, withoutBpm]) => {
      if (current) setData({ recentlyPlayed, gigs, groups, withoutBpm, today })
    })
    return () => {
      current = false
    }
  }, [partsKey, version])

  return data
}
