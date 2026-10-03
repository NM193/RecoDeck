import { describe, expect, it } from 'vitest'
import { cachedOwned, djSearchCards } from './search'
import type { KnownDj } from './names'
import { buildOwnershipIndex } from '../spotify/ownership'
import type { LibraryTrack } from '../tracklist/match'
import type { ArtistCandidate, DjTrack } from '../../types/dj'

function artist(
  id: string,
  name: string,
  imageUrl: string | null = null,
): ArtistCandidate {
  return { id, name, imageUrl, followers: null, slug: null }
}

describe("Search's DJs row", () => {
  const shown: KnownDj[] = [
    { key: 'luciano', name: 'Luciano', setCount: 6 },
    { key: 'lucia lu', name: 'Lucia Lu', setCount: 0 },
  ]

  it('shows the known DJs first, with their sets and what is owned', () => {
    const cards = djSearchCards(shown, [], new Map([['luciano', 23]]))
    expect(cards).toEqual([
      {
        key: 'luciano',
        name: 'Luciano',
        spotifyArtistId: null,
        imageUrl: null,
        subtitle: '6 sets · you own 23',
      },
      {
        key: 'lucia lu',
        name: 'Lucia Lu',
        spotifyArtistId: null,
        imageUrl: null,
        subtitle: 'watched',
      },
    ])
  })

  it('then Spotify artists not shown yet, at most six, opening with their id', () => {
    const results = [
      artist('s0', 'LUCIANO', 'https://i.scdn.co/luciano.jpg'),
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) =>
        artist(`s${c}`, `Luciano ${c}`),
      ),
    ]
    const cards = djSearchCards(shown, results, new Map())
    expect(cards.map((c) => c.name)).toEqual([
      'Luciano',
      'Lucia Lu',
      'Luciano A',
      'Luciano B',
      'Luciano C',
      'Luciano D',
      'Luciano E',
      'Luciano F',
    ])
    expect(cards[2]).toEqual({
      key: 'spotify:sA',
      name: 'Luciano A',
      spotifyArtistId: 'sA',
      imageUrl: null,
      subtitle: 'on Spotify',
    })
  })

  it("lends a known DJ the photo of Spotify's artist of exactly that name, not its id", () => {
    const cards = djSearchCards(
      shown,
      [artist('s0', 'LUCIANO', 'https://i.scdn.co/luciano.jpg')],
      new Map(),
    )
    expect(cards[0].imageUrl).toBe('https://i.scdn.co/luciano.jpg')
    // The page resolves the artist itself; a known card never forces one.
    expect(cards[0].spotifyArtistId).toBeNull()
  })
})

describe('you own N, from the cached tracks', () => {
  function lib(id: number, artist: string, title: string): LibraryTrack {
    return { id, artist, title, file_path: `/music/${artist} - ${title}.mp3` }
  }
  function track(spotifyId: string, title: string, artists: string): DjTrack {
    return {
      spotifyId,
      title,
      artists,
      album: null,
      releaseDate: null,
      isrc: null,
      durationMs: null,
    }
  }
  const index = buildOwnershipIndex([
    lib(1, 'Butch', 'Come Get Up (Extended Mix)'),
    lib(2, 'Moreno, Prieto, Ortega, Lopez', '300 Cash'),
  ])
  const tracks = [
    track('a', 'Come Get Up - Extended Mix', 'Butch, Santos'), // Owned
    track('b', '300 Cash', 'Moreno & Prieto, Sortech'), // Maybe
    track('c', 'Nothing Like It', 'Nobody'), // Missing
  ]

  it('counts Owned only', () => {
    expect(cachedOwned(tracks, index, [])).toBe(1)
  })

  it('counts a Maybe answered Yes', () => {
    expect(
      cachedOwned(tracks, index, [
        { spotifyId: 'b', libraryTrackId: 2, verdict: 'yes' },
      ]),
    ).toBe(2)
  })

  it('says nothing for a DJ never opened, or before the library has loaded', () => {
    expect(cachedOwned(undefined, index, [])).toBeNull()
    expect(cachedOwned([], index, [])).toBeNull()
    expect(cachedOwned(tracks, buildOwnershipIndex([]), [])).toBeNull()
  })
})
