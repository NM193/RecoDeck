import { describe, expect, it } from 'vitest'
import { genreTiles, sectionsEmpty } from './sectionContent'
import { DEFAULT_SECTION_PREFS } from '../../lib/search/sections'
import type { SectionsData } from './useSectionsData'

const nothing: SectionsData = {
  recentlyPlayed: [],
  djs: [],
  groups: { genres: [], addedRecently: 0, neverPlayed: 0 },
  recentlyAdded: [],
  savedSets: [],
  today: '2026-10-08',
}

describe('the genre tiles', () => {
  it('are the genres, then Recently added and Never played, each opening its filter', () => {
    const tiles = genreTiles({
      ...nothing,
      groups: {
        genres: [
          { genre: 'Tech House', count: 1581 },
          { genre: 'House', count: 1 },
        ],
        addedRecently: 12,
        neverPlayed: 8100,
      },
    })
    expect(tiles.map((tile) => [tile.name, tile.count, tile.filter])).toEqual([
      ['Tech House', '1,581 tracks', { genre: 'Tech House' }],
      ['House', '1 track', { genre: 'House' }],
      ['Recently added', '12 tracks · last 30 days', { added: 30 }],
      ['Never played', '8,100 tracks', { played: 'never' }],
    ])
    expect(tiles[0].colour).not.toBe(tiles[1].colour)
  })

  it('leave out a group of none', () => {
    expect(genreTiles(nothing)).toEqual([])
    expect(genreTiles({ ...nothing, groups: null })).toEqual([])
  })
})

describe('an empty Search page', () => {
  it('is one where no switched-on section has anything', () => {
    expect(sectionsEmpty(DEFAULT_SECTION_PREFS, nothing, [])).toBe(true)
    expect(sectionsEmpty(DEFAULT_SECTION_PREFS, nothing, ['traumer'])).toBe(
      false,
    )
  })

  it('ignores what a switched-off section would show', () => {
    const prefs = DEFAULT_SECTION_PREFS.map((pref) => ({
      ...pref,
      on: pref.id === 'genres',
    }))
    expect(sectionsEmpty(prefs, nothing, ['traumer'])).toBe(true)
  })
})
