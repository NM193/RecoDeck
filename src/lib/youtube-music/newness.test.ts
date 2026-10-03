// src/lib/youtube-music/newness.test.ts
import { describe, expect, it } from 'vitest'
import { newAndMissing } from './newness'
import type { Ownership } from '../spotify/ownership'
import type { YtmLibrary } from '../../types/youtubeMusic'

const library: YtmLibrary = {
  lists: [
    { id: 'LM', name: 'Liked music', position: 0, trackCount: 3, totalResults: 3, lastOpenedAt: 1000, unavailableAt: null },
    { id: 'PL1', name: 'Deep', position: 1, trackCount: 1, totalResults: 1, lastOpenedAt: 1000, unavailableAt: null },
  ],
  tracks: [
    { videoId: 'v1', title: 'A - One', channel: 'C', durationMs: 300_000 },
    { videoId: 'v2', title: 'A - Two', channel: 'C', durationMs: 300_000 },
    { videoId: 'set1', title: 'Someone | Live', channel: 'C', durationMs: 3_600_000 },
  ],
  entries: [
    { listId: 'LM', videoId: 'v1', addedAt: null, firstSeenAt: 1000 },
    { listId: 'LM', videoId: 'v2', addedAt: null, firstSeenAt: 2000 },
    { listId: 'LM', videoId: 'set1', addedAt: null, firstSeenAt: 2000 },
    { listId: 'PL1', videoId: 'set1', addedAt: null, firstSeenAt: 2000 },
  ],
  verdicts: [],
}

describe('new and missing on YouTube Music', () => {
  it('counts tracks first seen after their list was opened, never sets', () => {
    const counts = newAndMissing(library, new Map())
    expect(counts.total).toBe(1)
    expect(counts.byList).toEqual(new Map([['LM', 1]]))
  })

  it('leaves owned tracks out, and nothing is new on a baseline', () => {
    const owned = new Map<string, Ownership>([['v2', { kind: 'owned' }]])
    expect(newAndMissing(library, owned).total).toBe(0)
    const baseline: YtmLibrary = {
      ...library,
      lists: library.lists.map((list) => ({ ...list, lastOpenedAt: 2000 })),
    }
    expect(newAndMissing(baseline, new Map()).total).toBe(0)
  })
})
