// src/lib/spotify/newness.test.ts
import { describe, expect, it } from 'vitest'
import { isNew, newAndMissing } from './newness'
import type { Ownership } from './ownership'
import type {
  SpotifyEntry,
  SpotifyLibrary,
  SpotifyList,
} from '../../types/spotify'

const lists: SpotifyList[] = [
  {
    id: 'liked',
    name: 'Liked Songs',
    position: 0,
    trackCount: 3,
    lastOpenedAt: 1000,
  },
  {
    id: 'p1',
    name: 'Tech House',
    position: 1,
    trackCount: 2,
    lastOpenedAt: 1000,
  },
]

function entry(
  listId: string,
  spotifyId: string,
  firstSeenAt: number,
): SpotifyEntry {
  return { listId, spotifyId, addedAt: null, firstSeenAt }
}

function library(entries: SpotifyEntry[]): SpotifyLibrary {
  return { lists, tracks: [], entries, verdicts: [] }
}

const missing: Ownership = { kind: 'missing' }
const owned: Ownership = { kind: 'owned' }
const maybe: Ownership = { kind: 'maybe' }

describe('what counts as new', () => {
  it('is strictly later than the last opening — the first sync is the baseline', () => {
    expect(isNew(entry('liked', 'a', 1000), 1000)).toBe(false)
    expect(isNew(entry('liked', 'a', 1001), 1000)).toBe(true)
  })

  it('counts nothing right after the first sync', () => {
    const counts = newAndMissing(
      library([entry('liked', 'a', 1000)]),
      new Map([['a', missing]]),
    )
    expect(counts.total).toBe(0)
    expect(counts.byList.size).toBe(0)
  })

  it('counts a new, missing like', () => {
    const counts = newAndMissing(
      library([entry('liked', 'a', 2000)]),
      new Map([['a', missing]]),
    )
    expect(counts.total).toBe(1)
    expect(counts.byList.get('liked')).toBe(1)
  })

  it('counts one track new in two lists once on the header, and once on each list', () => {
    const counts = newAndMissing(
      library([entry('liked', 'a', 2000), entry('p1', 'a', 2000)]),
      new Map([['a', missing]]),
    )
    expect(counts.total).toBe(1)
    expect(counts.byList.get('liked')).toBe(1)
    expect(counts.byList.get('p1')).toBe(1)
  })

  it('does not count liking something already in the library', () => {
    const counts = newAndMissing(
      library([entry('liked', 'a', 2000)]),
      new Map([['a', owned]]),
    )
    expect(counts.total).toBe(0)
  })

  it('counts a Maybe — it is not known to be owned', () => {
    const counts = newAndMissing(
      library([entry('liked', 'a', 2000)]),
      new Map([['a', maybe]]),
    )
    expect(counts.total).toBe(1)
  })
})
