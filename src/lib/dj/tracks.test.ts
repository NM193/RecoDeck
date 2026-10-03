// src/lib/dj/tracks.test.ts
import { describe, expect, it } from 'vitest'
import { djRows, ownedCount, releasedYear } from './tracks'
import type { Ownership } from '../spotify/ownership'
import type { DjTrack } from '../../types/dj'

function track(
  spotifyId: string,
  title: string,
  releaseDate: string | null,
): DjTrack {
  return {
    spotifyId,
    title,
    artists: 'Luciano',
    album: null,
    releaseDate,
    isrc: null,
    durationMs: null,
  }
}

describe("a DJ's tracks as Spotify rows", () => {
  const tracks = [
    track('a', 'Alpine Dub', '2022-05-01'),
    track('b', 'Bring It Back', '2025'),
    track('c', 'Mercado', null),
    track('d', 'Sunday Jams - Luciano Remix', '2024-03'),
  ]
  const ownership = new Map<string, Ownership>([
    ['a', { kind: 'owned' }],
    ['b', { kind: 'maybe' }],
  ])

  it('puts the newest release first and the undated last', () => {
    expect(djRows(tracks, ownership).map((r) => r.track.spotifyId)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ])
  })

  it('carries ownership, Missing when unknown, and counts only Owned', () => {
    const rows = djRows(tracks, ownership)
    expect(rows.find((r) => r.track.spotifyId === 'c')?.ownership).toEqual({
      kind: 'missing',
    })
    expect(ownedCount(rows)).toBe(1)
  })

  it('shows the year of a release', () => {
    expect(releasedYear('2024-03-01')).toBe('2024')
    expect(releasedYear('2024')).toBe('2024')
    expect(releasedYear(null)).toBe('')
  })
})
