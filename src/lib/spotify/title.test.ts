// src/lib/spotify/title.test.ts
import { describe, expect, it } from 'vitest'
import { copyText, selectedRecsUrl, splitSpotifyTitle, toParsed } from './title'
import type { SpotifyTrack } from '../../types/spotify'

function track(title: string, artists: string): SpotifyTrack {
  return { spotifyId: 'id', title, artists, album: null, durationMs: null }
}

describe('reading a Spotify title', () => {
  it('takes the version from after the dash', () => {
    expect(splitSpotifyTitle('Little Girl - Original Mix')).toEqual({
      title: 'Little Girl',
      mix: 'Original Mix',
      bare: 'Little Girl',
    })
  })

  it('accepts an en dash', () => {
    expect(splitSpotifyTitle('Tell You – Dub').mix).toBe('Dub')
  })

  it('keeps the featured artist in the title, and leaves it out of the bare title', () => {
    expect(splitSpotifyTitle('I Need A Rush (feat. Sheree Hicks) - Extended Mix')).toEqual({
      title: 'I Need A Rush (feat. Sheree Hicks)',
      mix: 'Extended Mix',
      bare: 'I Need A Rush',
    })
  })

  it('reads a version some labels put in brackets', () => {
    expect(splitSpotifyTitle('Kids (Extended Mix)')).toEqual({
      title: 'Kids',
      mix: 'Extended Mix',
      bare: 'Kids',
    })
  })

  it('leaves a dash that is part of the title alone', () => {
    expect(splitSpotifyTitle('Love - Me')).toEqual({ title: 'Love - Me', mix: null, bare: 'Love - Me' })
  })

  it('takes only the last dash', () => {
    expect(splitSpotifyTitle('Love - Me - Dub')).toEqual({ title: 'Love - Me', mix: 'Dub', bare: 'Love - Me' })
  })

  it('keeps a hyphenated version whole', () => {
    expect(splitSpotifyTitle('Control - Re-Edit').mix).toBe('Re-Edit')
  })

  it('leaves a plain title as it is', () => {
    expect(splitSpotifyTitle('300 Cash')).toEqual({ title: '300 Cash', mix: null, bare: '300 Cash' })
  })
})

describe('the shape the library matcher reads', () => {
  it('matches on the bare title, and keeps the version and the featured artist in titleNorm', () => {
    expect(
      toParsed(track('I Need A Rush (feat. Sheree Hicks) - Extended Mix', 'Discoplex, Izaac Moses, Sheree Hicks')),
    ).toEqual({
      artist: 'Discoplex, Izaac Moses, Sheree Hicks',
      title: 'I Need A Rush',
      mix: 'Extended Mix',
      artistNorm: 'discoplex izaac moses sheree hicks',
      titleNorm: 'i need a rush sheree hicks extended mix',
    })
  })

  it('has no artist when Spotify gives none', () => {
    expect(toParsed(track('Untitled', '')).artist).toBeNull()
  })
})

describe('what Copy and SelectedRecs get', () => {
  it('copies artists, title and the mix', () => {
    expect(copyText(track('Little Girl - Original Mix', 'Clive, Deepower'))).toBe(
      'Clive, Deepower - Little Girl (Original Mix)',
    )
  })

  it('copies a title with no version as it is', () => {
    expect(copyText(track('300 Cash', 'Moreno & Prieto, Sortech'))).toBe('Moreno & Prieto, Sortech - 300 Cash')
  })

  it('leaves out "(feat. …)" — Spotify already lists the featured artist among the artists', () => {
    expect(
      copyText(track('I Need A Rush (feat. Sheree Hicks) - Extended Mix', 'Discoplex, Izaac Moses, Sheree Hicks')),
    ).toBe('Discoplex, Izaac Moses, Sheree Hicks - I Need A Rush (Extended Mix)')
  })

  it('copies the artists alone when the title is empty, and the title alone when there are no artists', () => {
    expect(copyText(track('', 'Clive, Deepower'))).toBe('Clive, Deepower')
    expect(copyText(track('Little Girl - Original Mix', ''))).toBe('Little Girl (Original Mix)')
  })

  it('searches SelectedRecs for the same text without the mix', () => {
    expect(selectedRecsUrl(track('300 Cash - Extended Mix', 'Moreno & Prieto, Sortech'))).toBe(
      'https://srv.selectedrecs.com/#/search?text=Moreno%20%26%20Prieto%2C%20Sortech%20-%20300%20Cash',
    )
  })
})
