import { describe, expect, it } from 'vitest'
import { homeGenreTiles, playlistGradient, userPlaylists } from './content'
import type { Playlist } from '../../types/track'

describe('homeGenreTiles', () => {
  it('shows the biggest genres, then Added lately and Never played, each with its filter', () => {
    const tiles = homeGenreTiles({
      genres: [
        { genre: 'Tech House', count: 1581 },
        { genre: 'House', count: 792 },
      ],
      addedRecently: 359,
      neverPlayed: 8142,
    })
    expect(tiles.map((t) => [t.name, t.count, t.filter])).toEqual([
      ['Tech House', '1,581', { genre: 'Tech House' }],
      ['House', '792', { genre: 'House' }],
      ['Added lately', '359', { added: 30 }],
      ['Never played', '8,142', { played: 'never' }],
    ])
    expect(tiles[0].colour).toBe('#7c3aed')
  })

  it('leaves out a tile for no tracks', () => {
    expect(homeGenreTiles({ genres: [], addedRecently: 0, neverPlayed: 0 })).toEqual([])
  })
})

describe('Your playlists', () => {
  const playlist = (id: number, playlist_type: string): Playlist => ({
    id,
    name: `P${id}`,
    playlist_type,
    parent_id: null,
    track_count: 3,
  })

  it('shows the playlists the sidebar shows, not their folders', () => {
    const shown = userPlaylists([
      playlist(1, 'manual'),
      playlist(2, 'folder'),
      playlist(3, 'ai_generated'),
      playlist(4, 'smart'),
    ])
    expect(shown.map((p) => p.id)).toEqual([1, 3, 4])
  })

  it('gives a playlist the same cover each time', () => {
    expect(playlistGradient('Deep House Vibes')).toBe(playlistGradient('Deep House Vibes'))
    expect(playlistGradient('Deep House Vibes')).toMatch(/^linear-gradient/)
  })
})
