import { describe, expect, it } from 'vitest'
import {
  HOME_CARDS,
  HOME_GROUPS,
  defaultLayout,
  fitToCatalog,
  newCardItem,
  readStoredLayout,
  storedLayoutJson,
} from './cards'

const places = (layout: { i: string; x: number; y: number; w: number; h: number }[]) =>
  layout.map(({ i, x, y, w, h }) => [i, x, y, w, h])

describe('the catalog', () => {
  it('puts every card under one of the four groups', () => {
    for (const card of HOME_CARDS) expect(HOME_GROUPS).toContain(card.group)
    expect(new Set(HOME_CARDS.map((card) => card.id)).size).toBe(HOME_CARDS.length)
  })
})

describe('defaultLayout', () => {
  it('is the spec’s eight cards, with their limits from the catalog', () => {
    const layout = defaultLayout()
    expect(places(layout)).toEqual([
      ['needs-you', 0, 0, 2, 2],
      ['recently-played', 2, 0, 2, 2],
      ['upcoming-gigs', 0, 2, 2, 2],
      ['library-by-genre', 2, 2, 2, 2],
      ['playlists', 0, 4, 4, 1],
      ['library-stats', 0, 5, 1, 1],
      ['not-analyzed', 1, 5, 1, 1],
      ['quick-actions', 2, 5, 2, 1],
    ])
    expect(layout[0]).toMatchObject({ minW: 2, minH: 1, maxW: 4, maxH: 2 })
  })
})

describe('readStoredLayout', () => {
  it('replaces the old form (a bare list) by the default once, to be written back', () => {
    const old = JSON.stringify([{ i: 'recently-played', x: 0, y: 0, w: 2, h: 1 }])
    const { layout, rewrite } = readStoredLayout(old)
    expect(rewrite).toBe(true)
    expect(layout).toEqual(defaultLayout())
  })

  it('shows what Customize saved after that', () => {
    const saved = storedLayoutJson([{ i: 'quick-actions', x: 2, y: 0, w: 2, h: 1 }])
    const { layout, rewrite } = readStoredLayout(saved)
    expect(rewrite).toBe(false)
    expect(places(layout)).toEqual([['quick-actions', 2, 0, 2, 1]])
  })

  it('shows the default for nothing stored, unreadable JSON or a newer version, and keeps it', () => {
    for (const json of [null, '', '{nope', JSON.stringify({ version: 3, layout: [] })]) {
      expect(readStoredLayout(json)).toEqual({ layout: defaultLayout(), rewrite: false })
    }
  })

  it('keeps an empty layout empty', () => {
    expect(readStoredLayout(storedLayoutJson([])).layout).toEqual([])
  })
})

describe('fitToCatalog', () => {
  it('drops unknown, removed and repeated ids and malformed items', () => {
    const layout = fitToCatalog([
      { i: 'ai-recommendations', x: 0, y: 0, w: 2, h: 1 },
      { i: 'library-insights', x: 0, y: 1, w: 4, h: 1 },
      { i: 'playlists', x: 0, y: 2, w: 4, h: 2 },
      { i: 'playlists', x: 0, y: 4, w: 2, h: 1 },
      { i: 'quick-actions', x: 'left', y: 0, w: 2, h: 1 },
      null,
      'needs-you',
    ])
    expect(places(layout)).toEqual([['playlists', 0, 2, 4, 2]])
  })

  it('takes the limits from the catalog, not from what was stored, and clamps the size into them', () => {
    const [stats, analyzed, genre] = fitToCatalog([
      { i: 'library-stats', x: 0, y: 0, w: 4, h: 3, minH: 3, maxH: 3 },
      { i: 'not-analyzed', x: 3, y: 1, w: 4, h: 1 },
      { i: 'library-by-genre', x: 0, y: 2, w: 1, h: 0 },
    ])
    expect(stats).toMatchObject({ w: 4, h: 1, minH: 1, maxH: 1 })
    // Two columns wide at most, kept inside the grid.
    expect(analyzed).toMatchObject({ x: 2, w: 2, h: 1, maxW: 2 })
    expect(genre).toMatchObject({ w: 2, h: 1, minW: 2 })
  })
})

describe('newCardItem', () => {
  it('adds a card at its default size below the others', () => {
    expect(newCardItem('upcoming-gigs')).toMatchObject({ i: 'upcoming-gigs', x: 0, y: Infinity, w: 2, h: 2, maxH: 3 })
    expect(newCardItem('ai-recommendations')).toBeNull()
  })
})

describe('storedLayoutJson', () => {
  it('stores version 2 with each card’s place and size only', () => {
    const json = storedLayoutJson(defaultLayout().slice(0, 1))
    expect(JSON.parse(json)).toEqual({ version: 2, layout: [{ i: 'needs-you', x: 0, y: 0, w: 2, h: 2 }] })
  })
})
