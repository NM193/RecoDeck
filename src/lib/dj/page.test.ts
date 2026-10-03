// src/lib/dj/page.test.ts
import { describe, expect, it } from 'vitest'
import {
  REFRESHING,
  djTabs,
  gigsState,
  raPick,
  refreshFailed,
  setMeta,
  setThumbnail,
  sourceAfter,
  spotifyArtistUrl,
} from './page'
import type { ArtistCandidate } from '../../types/dj'

describe('a source after its refresh', () => {
  it('keeps the outcome and the error', () => {
    expect(sourceAfter({ outcome: 'failed', error: 'offline' })).toEqual({
      refreshing: false,
      outcome: 'failed',
      error: 'offline',
    })
    expect(refreshFailed(sourceAfter({ outcome: 'failed', error: null }))).toBe(
      true,
    )
    expect(
      refreshFailed(sourceAfter({ outcome: 'notFound', error: null })),
    ).toBe(false)
    expect(refreshFailed(REFRESHING)).toBe(false)
  })
})

describe('the Gigs tab', () => {
  const after = (outcome: 'fresh' | 'refreshed' | 'failed' | 'notFound') =>
    sourceAfter({ outcome, error: null })

  it('shows only the RA link when RA failed or has no such artist and nothing is cached', () => {
    expect(gigsState(after('failed'), 0)).toBe('link')
    expect(gigsState(after('notFound'), 0)).toBe('link')
  })

  it('keeps cached gigs when a refresh failed', () => {
    expect(gigsState(after('failed'), 3)).toBe('list')
  })

  it('says it is looking while RA is asked and nothing is cached', () => {
    expect(gigsState(REFRESHING, 0)).toBe('searching')
    expect(gigsState(REFRESHING, 2)).toBe('list')
  })

  it('is empty when RA answered with no gigs', () => {
    expect(gigsState(after('refreshed'), 0)).toBe('none')
    expect(gigsState(after('fresh'), 0)).toBe('none')
  })
})

describe('the tab row', () => {
  it('numbers every tab but Overview, leaving out unknown and zero counts', () => {
    expect(djTabs({ tracks: 214, plays: 38, sets: null, gigs: 0 })).toEqual([
      { id: 'overview', label: 'Overview', count: null },
      { id: 'tracks', label: 'Tracks', count: 214 },
      { id: 'plays', label: 'Plays', count: 38 },
      { id: 'sets', label: 'Sets', count: null },
      { id: 'gigs', label: 'Gigs', count: null },
    ])
  })
})

describe('a set card', () => {
  it('reads length and tracks', () => {
    expect(setMeta({ duration_ms: 6_720_000, track_count: 24 })).toBe(
      '1 h 52 min · 24 tracks',
    )
    expect(setMeta({ duration_ms: 2_880_000, track_count: 1 })).toBe(
      '48 min · 1 track',
    )
    expect(setMeta({ duration_ms: 7_200_000 })).toBe('2 h')
    expect(setMeta({ track_count: 0 })).toBe('')
    expect(setMeta({})).toBe('')
  })

  it("has YouTube's thumbnail for the video", () => {
    expect(setThumbnail('abc123')).toBe(
      'https://i.ytimg.com/vi/abc123/mqdefault.jpg',
    )
  })
})

describe('links and picks', () => {
  it("opens the artist's Spotify page", () => {
    expect(spotifyArtistUrl('4xRYI6VqpkE3UwrDrAZL8L')).toBe(
      'https://open.spotify.com/artist/4xRYI6VqpkE3UwrDrAZL8L',
    )
  })

  it('turns an RA candidate with a slug into a pick', () => {
    const candidate: ArtistCandidate = {
      id: '570',
      name: 'Marco Carola',
      imageUrl: 'https://static.ra.co/images/profiles/square/marcocarola.jpg',
      followers: null,
      slug: 'marcocarola',
    }
    expect(raPick(candidate)).toEqual({
      id: '570',
      slug: 'marcocarola',
      imageUrl: 'https://static.ra.co/images/profiles/square/marcocarola.jpg',
    })
    expect(raPick({ ...candidate, slug: null })).toBeNull()
  })
})
