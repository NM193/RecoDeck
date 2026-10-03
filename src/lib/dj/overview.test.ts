// src/lib/dj/overview.test.ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OVERVIEW,
  hiddenCards,
  orderFromGrid,
  packOverview,
  parseOverview,
  serializeOverview,
} from './overview'

describe('the stored overview', () => {
  it('reads a stored order', () => {
    expect(parseOverview('["tracks","upcoming-gigs"]')).toEqual([
      'tracks',
      'upcoming-gigs',
    ])
  })

  it('ignores unknown ids and repeats', () => {
    expect(parseOverview('["plays","weather","plays","photos"]')).toEqual([
      'plays',
      'photos',
    ])
  })

  it('keeps an overview emptied on purpose', () => {
    expect(parseOverview('[]')).toEqual([])
  })

  it('falls back to the default for anything else', () => {
    for (const raw of [
      null,
      '',
      'not json',
      '{"a":1}',
      '[1,2]',
      '["weather"]',
      'null',
    ]) {
      expect(parseOverview(raw)).toEqual(DEFAULT_OVERVIEW)
    }
  })

  it('stores the order only', () => {
    expect(serializeOverview(['tracks', 'plays'])).toBe('["tracks","plays"]')
  })
})

describe('packing cards into two columns', () => {
  it('lays out the default: two halves, then a full row', () => {
    expect(packOverview(DEFAULT_OVERVIEW)).toEqual([
      { i: 'upcoming-gigs', x: 0, y: 0, w: 1, h: 1 },
      { i: 'plays', x: 1, y: 0, w: 1, h: 1 },
      { i: 'tracks', x: 0, y: 1, w: 2, h: 1 },
    ])
  })

  it('gives a full card its own row, even after a lone half', () => {
    expect(packOverview(['photos', 'tracks', 'past-gigs'])).toEqual([
      { i: 'photos', x: 0, y: 0, w: 1, h: 1 },
      { i: 'tracks', x: 0, y: 1, w: 2, h: 1 },
      { i: 'past-gigs', x: 0, y: 2, w: 1, h: 1 },
    ])
  })

  it('reads the order back off a dragged grid by row, then column', () => {
    const dragged = [
      { i: 'tracks', x: 0, y: 2 },
      { i: 'plays', x: 0, y: 0 },
      { i: 'upcoming-gigs', x: 1, y: 0 },
      { i: 'stale-id', x: 0, y: 5 },
    ]
    expect(orderFromGrid(dragged)).toEqual(['plays', 'upcoming-gigs', 'tracks'])
  })

  it('round-trips: packing an order and reading it back gives the same order', () => {
    const order = ['missing', 'photos', 'past-gigs', 'sets', 'plays'] as const
    expect(orderFromGrid(packOverview([...order]))).toEqual(order)
  })

  it('lists the hidden cards as pills, in catalogue order', () => {
    expect(hiddenCards(DEFAULT_OVERVIEW).map((c) => c.title)).toEqual([
      'Latest sets',
      'Photos',
      'Past gigs',
      'Missing tracks',
    ])
  })
})
