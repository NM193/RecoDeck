// src/components/home/content.ts
// What Library by genre's tiles and Your playlists' cards show (Home cards
// spec, The grid).
import { GENRE_COLOURS } from '../search/sectionContent'
import { count } from '../../lib/home/labels'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { LibraryGroups } from '../../types/sections'
import type { Playlist } from '../../types/track'

export interface HomeTile {
  key: string
  name: string
  count: string
  colour: string
  filter: TrackFilter
}

/**
 * The 6 biggest genres in Search's colours, then Added lately (the last 30
 * days) and Never played; a tile for no tracks is left out. Each opens All
 * Tracks with its filter.
 */
export function homeGenreTiles(groups: LibraryGroups): HomeTile[] {
  const tiles: HomeTile[] = groups.genres.map((group, index) => ({
    key: `genre:${group.genre}`,
    name: group.genre,
    count: count(group.count),
    colour: GENRE_COLOURS[index % GENRE_COLOURS.length],
    filter: { genre: group.genre },
  }))
  if (groups.addedRecently > 0) {
    tiles.push({
      key: 'added',
      name: 'Added lately',
      count: count(groups.addedRecently),
      colour: '#334155',
      filter: { added: 30 },
    })
  }
  if (groups.neverPlayed > 0) {
    tiles.push({
      key: 'never-played',
      name: 'Never played',
      count: count(groups.neverPlayed),
      colour: '#3f3f46',
      filter: { played: 'never' },
    })
  }
  return tiles
}

/** The playlists, not their folders, in the sidebar's order (as the sidebar lists them). */
export function userPlaylists(playlists: readonly Playlist[]): Playlist[] {
  return playlists.filter((p) => p.playlist_type !== 'folder')
}

const PLAYLIST_GRADIENTS = [
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
  'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
  'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
  'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
]

/** A playlist's cover: a gradient picked by its name, the same each time. */
export function playlistGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return PLAYLIST_GRADIENTS[Math.abs(hash) % PLAYLIST_GRADIENTS.length]
}
