// src/lib/dj/gigs.test.ts
import { describe, expect, it } from 'vitest'
import {
  gigDay,
  gigLabel,
  gigPlace,
  heroMeta,
  heroMetaParts,
  localDay,
  splitGigs,
} from './gigs'
import type { DjGig } from '../../types/dj'

function gig(raEventId: string, date: string): DjGig {
  return {
    raEventId,
    date,
    venue: 'Fabric',
    city: 'London',
    country: 'GB',
    lineup: null,
    url: null,
  }
}

describe('upcoming and past gigs', () => {
  const gigs = [
    gig('a', '2026-10-19T00:00:00.000'),
    gig('b', '2026-10-03T00:00:00.000'),
    gig('c', '2026-09-30'),
    gig('d', '2026-11-02'),
    gig('e', '2026-08-01'),
  ]

  it('counts today as upcoming; upcoming soonest first, past latest first', () => {
    const { upcoming, past } = splitGigs(gigs, '2026-10-03')
    expect(upcoming.map((g) => g.raEventId)).toEqual(['b', 'a', 'd'])
    expect(past.map((g) => g.raEventId)).toEqual(['c', 'e'])
  })

  it('moves a gig to the past as the days go by, with no refresh', () => {
    expect(
      splitGigs(gigs, '2026-10-20').upcoming.map((g) => g.raEventId),
    ).toEqual(['d'])
  })

  it('reads the local day', () => {
    expect(localDay(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03')
    expect(localDay(new Date(2026, 0, 9))).toBe('2026-01-09')
  })
})

describe('how a gig reads', () => {
  it('has a date block, a label, and a place', () => {
    expect(gigDay('2026-10-12T00:00:00.000')).toEqual({
      day: '12',
      month: 'Oct',
    })
    expect(gigDay('not a date')).toEqual({ day: '', month: '' })
    expect(gigLabel('2026-10-10', '2026-10-03')).toBe('Sat, Oct 10')
    expect(gigLabel('2027-01-08', '2026-10-03')).toBe('Fri, Jan 8, 2027')
    expect(gigPlace(gig('a', '2026-10-12'))).toBe('London, GB')
    expect(gigPlace({ ...gig('a', '2026-10-12'), city: null })).toBe('GB')
  })
})

describe("the hero's meta line", () => {
  it('says all three when it knows them', () => {
    expect(
      heroMeta({ owned: 23, tracks: 214, sets: 6, nextGig: 'Sat, Oct 10' }),
    ).toEqual([
      'You own 23 of 214 tracks',
      '6 sets saved',
      'next gig Sat, Oct 10',
    ])
  })

  it('leaves out what it does not know', () => {
    expect(
      heroMeta({ owned: null, tracks: null, sets: 1, nextGig: null }),
    ).toEqual(['1 set saved'])
    expect(heroMeta({ owned: 0, tracks: 0, sets: 0, nextGig: null })).toEqual(
      [],
    )
  })
})

describe("the hero's meta line, with its numbers bold", () => {
  it('splits each part around the part shown bold', () => {
    expect(
      heroMetaParts({
        owned: 23,
        tracks: 214,
        sets: 6,
        nextGig: 'Sat, Oct 10',
      }),
    ).toEqual([
      { lead: '', bold: 'You own 23', tail: ' of 214 tracks' },
      { lead: '', bold: '6 sets', tail: ' saved' },
      { lead: 'next gig ', bold: 'Sat, Oct 10', tail: '' },
    ])
    expect(
      heroMetaParts({ owned: null, tracks: null, sets: 1, nextGig: null }),
    ).toEqual([{ lead: '', bold: '1 set', tail: ' saved' }])
  })
})
