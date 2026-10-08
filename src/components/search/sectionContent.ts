// src/components/search/sectionContent.ts
// What each Search section shows, and whether it has anything: a section
// with nothing to show is left out, and with none at all the page shows
// "Search your library" as before.
import { trackCount } from '../../lib/search/labels'
import type { SearchSectionId, SectionPref } from '../../lib/search/sections'
import type { TrackFilter } from '../../lib/trackTable/filter'
import type { SectionsData } from './useSectionsData'

/** True when no switched-on section has anything to show. */
export function sectionsEmpty(
  prefs: SectionPref[],
  data: SectionsData,
  recentSearches: string[],
): boolean {
  return prefs.every(
    (pref) => !pref.on || !hasContent(pref.id, data, recentSearches),
  )
}

export function hasContent(
  id: SearchSectionId,
  data: SectionsData,
  recentSearches: string[],
): boolean {
  switch (id) {
    case 'recent-searches':
      return recentSearches.length > 0
    case 'recently-played':
      return data.recentlyPlayed.length > 0
    case 'your-djs':
      return data.djs.length > 0
    case 'genres':
      return genreTiles(data).length > 0
    case 'recently-added':
      return data.recentlyAdded.length > 0
    case 'saved-sets':
      return data.savedSets.length > 0
  }
}

/** The genre tiles' colours, biggest genre first (the approved mockup's); Home's too. */
export const GENRE_COLOURS = [
  '#7c3aed',
  '#0e7490',
  '#be185d',
  '#c2410c',
  '#4338ca',
  '#15803d',
]

export interface GenreTile {
  key: string
  name: string
  count: string
  colour: string
  filter: TrackFilter
}

/** The biggest genres, then Recently added and Never played; a group of none is left out. */
export function genreTiles({ groups }: SectionsData): GenreTile[] {
  if (!groups) return []
  const tiles: GenreTile[] = groups.genres.map((group, index) => ({
    key: `genre:${group.genre}`,
    name: group.genre,
    count: trackCount(group.count),
    colour: GENRE_COLOURS[index % GENRE_COLOURS.length],
    filter: { genre: group.genre },
  }))
  if (groups.addedRecently > 0) {
    tiles.push({
      key: 'added',
      name: 'Recently added',
      count: `${trackCount(groups.addedRecently)} · last 30 days`,
      colour: '#334155',
      filter: { added: 30 },
    })
  }
  if (groups.neverPlayed > 0) {
    tiles.push({
      key: 'never-played',
      name: 'Never played',
      count: trackCount(groups.neverPlayed),
      colour: '#3f3f46',
      filter: { played: 'never' },
    })
  }
  return tiles
}
