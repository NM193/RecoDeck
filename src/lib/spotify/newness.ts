// src/lib/spotify/newness.ts
/**
 * "New" means new since the list was last opened, by RecoDeck's own clock: a
 * pair's `firstSeenAt` (the sync that first stored it) against the list's
 * `lastOpenedAt`. Spotify's `addedAt` is not used: a track liked at 09:00 and
 * first synced at 09:30, after the list was opened at 09:10, is still new.
 */
import type { Ownership } from './ownership'
import type { SpotifyEntry, SpotifyLibrary } from '../../types/spotify'

export interface NewCounts {
  /** Distinct tracks new somewhere and not owned — the SPOTIFY header number. */
  total: number
  /** The same, per list id. Lists with none are absent. */
  byList: Map<string, number>
}

/** Strictly later: a list's first sync stamps both with the same time. */
export function isNew(entry: SpotifyEntry, lastOpenedAt: number): boolean {
  return entry.firstSeenAt > lastOpenedAt
}

export function newAndMissing(library: SpotifyLibrary, ownership: Map<string, Ownership>): NewCounts {
  const opened = new Map(library.lists.map((list) => [list.id, list.lastOpenedAt]))
  const distinct = new Set<string>()
  const byList = new Map<string, number>()

  for (const entry of library.entries) {
    const lastOpenedAt = opened.get(entry.listId)
    if (lastOpenedAt === undefined || !isNew(entry, lastOpenedAt)) continue
    if (ownership.get(entry.spotifyId)?.kind === 'owned') continue
    distinct.add(entry.spotifyId)
    byList.set(entry.listId, (byList.get(entry.listId) ?? 0) + 1)
  }

  return { total: distinct.size, byList }
}
