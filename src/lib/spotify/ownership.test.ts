// src/lib/spotify/ownership.test.ts
import { describe, expect, it } from 'vitest'
import { buildOwnershipIndex, classifyTracks } from './ownership'
import type { LibraryTrack } from '../tracklist/match'
import type { SpotifyTrack, SpotifyVerdict } from '../../types/spotify'

function lib(id: number, artist: string, title: string): LibraryTrack {
  return { id, artist, title, file_path: `/music/${artist} - ${title}.mp3` }
}

function sp(spotifyId: string, title: string, artists: string): SpotifyTrack {
  return { spotifyId, title, artists, album: null, durationMs: null }
}

function classify(tracks: SpotifyTrack[], library: LibraryTrack[], verdicts: SpotifyVerdict[] = []) {
  return classifyTracks(tracks, buildOwnershipIndex(library), verdicts)
}

describe('do I own this Spotify track?', () => {
  const shelf = [
    lib(1, 'Butch', 'Come Get Up (Extended Mix)'),
    lib(2, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
    lib(3, 'Witchy', 'Witch Doctor (Extended Mix)'),
  ]

  it('is Owned on a strong match, with the file', () => {
    const result = classify([sp('a', 'Come Get Up - Extended Mix', 'Butch, Santos')], shelf)
    expect(result.get('a')).toEqual({ kind: 'owned', file: shelf[0] })
  })

  it('is Maybe on a weak match, and says why', () => {
    const result = classify([sp('b', '300 Cash', 'Moreno & Prieto, Sortech')], shelf)
    expect(result.get('b')).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist partly matches',
    })
  })

  it('is Missing when nothing matches', () => {
    expect(classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf).get('c')).toEqual({ kind: 'missing' })
  })

  it('does not take a remix for the extended mix — the version Spotify puts after the dash counts', () => {
    const result = classify([sp('d', 'Witch Doctor - Hot Since 82 Remix', 'Witchy')], shelf)
    expect(result.get('d')?.kind).toBe('missing')
  })

  it('takes Original Mix, Extended Mix and Radio Edit for the same record', () => {
    const extended = [lib(6, 'Clive, Deepower', 'Little Girl (Extended Mix)')]
    const original = [lib(7, 'Clive, Deepower', 'Little Girl (Original Mix)')]
    const artists = 'Clive, Deepower'

    expect(classify([sp('e', 'Little Girl - Original Mix', artists)], extended).get('e')).toEqual({
      kind: 'owned',
      file: extended[0],
    })
    expect(classify([sp('f', 'Little Girl - Extended Mix', artists)], original).get('f')).toEqual({
      kind: 'owned',
      file: original[0],
    })
    expect(classify([sp('g', 'Little Girl - Radio Edit', artists)], extended).get('g')).toEqual({
      kind: 'owned',
      file: extended[0],
    })
  })

  it('does not take a named remix for the Original Mix', () => {
    const original = [lib(8, 'Witchy', 'Witch Doctor (Original Mix)')]
    expect(classify([sp('h', 'Witch Doctor - Hot Since 82 Remix', 'Witchy')], original).get('h')).toEqual({
      kind: 'missing',
    })
  })

  it('is Owned after a Yes, whatever the matcher thinks', () => {
    const verdicts: SpotifyVerdict[] = [{ spotifyId: 'c', libraryTrackId: 2, verdict: 'yes' }]
    const result = classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf, verdicts)
    expect(result.get('c')).toEqual({ kind: 'owned', file: shelf[1] })
  })

  it('looks past a file answered No, to another one or to nothing', () => {
    const twins = [
      lib(4, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
      lib(5, 'Moreno, Prieto, Garcia, Ruiz', '300 Cash'),
    ]
    const track = sp('b', '300 Cash', 'Moreno & Prieto, Sortech')

    const first = classify([track], twins).get('b')
    expect(first?.file?.id).toBe(4)

    const noToFour: SpotifyVerdict[] = [{ spotifyId: 'b', libraryTrackId: 4, verdict: 'no' }]
    expect(classify([track], twins, noToFour).get('b')).toMatchObject({ kind: 'maybe', file: twins[1] })

    const noToBoth: SpotifyVerdict[] = [...noToFour, { spotifyId: 'b', libraryTrackId: 5, verdict: 'no' }]
    expect(classify([track], twins, noToBoth).get('b')).toEqual({ kind: 'missing' })
  })

  it('ignores a verdict about a file that is no longer in the library', () => {
    const verdicts: SpotifyVerdict[] = [{ spotifyId: 'c', libraryTrackId: 999, verdict: 'yes' }]
    expect(classify([sp('c', 'Tell You', 'Prunk, Retrouve')], shelf, verdicts).get('c')).toEqual({
      kind: 'missing',
    })
  })

  it('answers for every track, keyed by Spotify id', () => {
    const result = classify([sp('a', 'Come Get Up', 'Butch'), sp('c', 'Tell You', 'Prunk')], shelf)
    expect([...result.keys()]).toEqual(['a', 'c'])
  })
})
