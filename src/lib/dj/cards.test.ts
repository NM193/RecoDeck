import { describe, expect, it } from 'vitest'
import {
  CARD_TRACK_FILTERS,
  addCard,
  cardMore,
  cardPlacement,
  cardTarget,
  djPhotos,
  lineupNames,
  removeCard,
  type OverviewCounts,
} from './cards'
import { packOverview } from './overview'

const counts: OverviewCounts = {
  upcoming: 9,
  past: 20,
  sets: 6,
  tracks: 214,
  missing: 180,
}

describe('the "more" text of a card title', () => {
  it('counts what the tab behind it shows', () => {
    expect(cardMore('upcoming-gigs', counts)).toBe('all 9 →')
    expect(cardMore('past-gigs', counts)).toBe('all 20 →')
    expect(cardMore('plays', counts)).toBe('from your 6 sets →')
    expect(cardMore('tracks', counts)).toBe('all 214 →')
    expect(cardMore('sets', counts)).toBe('all 6 →')
    expect(cardMore('missing', counts)).toBe('all 180 missing →')
  })

  it('says "set" for one', () => {
    expect(cardMore('plays', { ...counts, sets: 1 })).toBe('from your 1 set →')
  })

  it('has none while the number is unknown or zero', () => {
    const none: OverviewCounts = {
      upcoming: null,
      past: 0,
      sets: null,
      tracks: 0,
      missing: null,
    }
    for (const id of [
      'upcoming-gigs',
      'past-gigs',
      'plays',
      'tracks',
      'sets',
      'missing',
    ] as const) {
      expect(cardMore(id, none)).toBeNull()
    }
  })

  it('has none for Photos, which leads nowhere', () => {
    expect(cardMore('photos', counts)).toBeNull()
  })
})

describe('where a card title leads', () => {
  it('opens the card’s tab with every row shown', () => {
    expect(cardTarget('upcoming-gigs')).toEqual({ tab: 'gigs', filter: 'all' })
    expect(cardTarget('plays')).toEqual({ tab: 'plays', filter: 'all' })
    expect(cardTarget('tracks')).toEqual({ tab: 'tracks', filter: 'all' })
  })

  it('opens Tracks on its Missing chip from the Missing card', () => {
    expect(cardTarget('missing')).toEqual({ tab: 'tracks', filter: 'missing' })
  })

  it('leads nowhere from Photos', () => {
    expect(cardTarget('photos')).toBeNull()
  })
})

describe('a card’s place in the normal two-column grid', () => {
  it('turns the packed position into CSS grid lines', () => {
    const [gigs, plays, tracks, photos] = packOverview([
      'upcoming-gigs',
      'plays',
      'tracks',
      'photos',
    ])
    expect(cardPlacement(gigs)).toEqual({ gridColumn: '1', gridRow: '1' })
    expect(cardPlacement(plays)).toEqual({ gridColumn: '2', gridRow: '1' })
    expect(cardPlacement(tracks)).toEqual({
      gridColumn: '1 / span 2',
      gridRow: '2',
    })
    expect(cardPlacement(photos)).toEqual({ gridColumn: '1', gridRow: '3' })
  })
})

describe('adding and removing cards while customizing', () => {
  it('appends a card at the end', () => {
    expect(addCard(['plays', 'tracks'], 'photos')).toEqual([
      'plays',
      'tracks',
      'photos',
    ])
  })

  it('never adds a card twice', () => {
    expect(addCard(['plays', 'tracks'], 'plays')).toEqual(['plays', 'tracks'])
  })

  it('removes a card and keeps the others in order', () => {
    expect(removeCard(['upcoming-gigs', 'plays', 'tracks'], 'plays')).toEqual([
      'upcoming-gigs',
      'tracks',
    ])
    expect(removeCard(['tracks'], 'plays')).toEqual(['tracks'])
  })
})

describe('the track filters of the Tracks card', () => {
  it('are the mockup’s All, Missing and Owned', () => {
    expect(CARD_TRACK_FILTERS.map((filter) => filter.key)).toEqual([
      'all',
      'missing',
      'owned',
    ])
  })
})

describe('a gig’s lineup as names', () => {
  it('splits RA’s list on commas', () => {
    expect(lineupNames('Marco Carola, Loco Dice')).toEqual([
      'Marco Carola',
      'Loco Dice',
    ])
  })

  it('keeps a single name and drops empty parts', () => {
    expect(lineupNames('Ricardo Villalobos')).toEqual(['Ricardo Villalobos'])
    expect(lineupNames(' Marco Carola ,, Loco Dice, ')).toEqual([
      'Marco Carola',
      'Loco Dice',
    ])
  })

  it('has no names without a lineup', () => {
    expect(lineupNames(null)).toEqual([])
    expect(lineupNames('')).toEqual([])
  })
})

describe('the Photos card', () => {
  it('shows the Spotify photo, then the RA one', () => {
    expect(
      djPhotos({
        spotifyImageUrl: 'https://i.scdn.co/a',
        raImageUrl: 'https://static.ra.co/b',
      }),
    ).toEqual([
      { url: 'https://i.scdn.co/a', source: 'Spotify' },
      { url: 'https://static.ra.co/b', source: 'Resident Advisor' },
    ])
  })

  it('leaves out what is missing, and a repeat', () => {
    expect(
      djPhotos({ spotifyImageUrl: null, raImageUrl: 'https://static.ra.co/b' }),
    ).toEqual([{ url: 'https://static.ra.co/b', source: 'Resident Advisor' }])
    expect(
      djPhotos({ spotifyImageUrl: 'https://x/a', raImageUrl: 'https://x/a' }),
    ).toHaveLength(1)
    expect(djPhotos(null)).toEqual([])
  })
})
