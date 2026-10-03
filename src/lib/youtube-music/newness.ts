// src/lib/youtube-music/newness.ts
/**
 * "New and missing", as for Spotify: a pair first seen after its list was
 * last opened, whose track is not owned. Sets are never new — they are not
 * tracks — and unavailable videos are never stored, so they cannot be.
 */
import { isNew, type NewCounts } from '../spotify/newness'
import type { Ownership } from '../spotify/ownership'
import { isSet } from './rows'
import type { YtmLibrary } from '../../types/youtubeMusic'

export function newAndMissing(
  library: YtmLibrary,
  ownership: Map<string, Ownership>,
): NewCounts {
  const opened = new Map(
    library.lists.map((list) => [list.id, list.lastOpenedAt]),
  )
  const sets = new Set(
    library.tracks.filter(isSet).map((track) => track.videoId),
  )
  const distinct = new Set<string>()
  const byList = new Map<string, number>()

  for (const entry of library.entries) {
    const lastOpenedAt = opened.get(entry.listId)
    if (lastOpenedAt === undefined || !isNew(entry, lastOpenedAt)) continue
    if (sets.has(entry.videoId)) continue
    if (ownership.get(entry.videoId)?.kind === 'owned') continue
    distinct.add(entry.videoId)
    byList.set(entry.listId, (byList.get(entry.listId) ?? 0) + 1)
  }

  return { total: distinct.size, byList }
}
