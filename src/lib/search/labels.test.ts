import { describe, expect, it } from 'vitest'
import { daysAgoLabel, djInitials, djLine, trackCount } from './labels'

// SQLite's UTC text for a local time.
function stored(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

describe("a DJ card's one line", () => {
  it('names the next gig', () => {
    expect(
      djLine(
        { nextGig: { date: '2026-10-03', venue: 'Depot' }, watched: true },
        '2026-10-01',
      ),
    ).toBe('next gig Sat, Oct 3')
  })

  it('says a watched DJ without a gig is watched for sets', () => {
    expect(djLine({ nextGig: null, watched: true }, '2026-10-01')).toBe(
      'watching for sets',
    )
  })

  it('is empty otherwise', () => {
    expect(djLine({ nextGig: null, watched: false }, '2026-10-01')).toBe('')
  })
})

describe("a DJ's initials", () => {
  it('takes the first letters of the first two words', () => {
    expect(djInitials('Joseph Capriati')).toBe('JC')
    expect(djInitials('Hot Since 82')).toBe('HS')
    expect(djInitials(' traumer ')).toBe('T')
    expect(djInitials('Âme')).toBe('Â')
  })
})

describe('when a track or set was added', () => {
  const now = new Date(2026, 9, 8, 12, 0)

  it('counts local days', () => {
    expect(daysAgoLabel(stored(new Date(2026, 9, 8, 0, 30)), now)).toBe('today')
    expect(daysAgoLabel(stored(new Date(2026, 9, 7, 23, 50)), now)).toBe(
      'yesterday',
    )
    expect(daysAgoLabel(stored(new Date(2026, 9, 5, 9, 0)), now)).toBe(
      '3 days ago',
    )
  })

  it('gives the date after a week, and the year when it is not this one', () => {
    expect(daysAgoLabel(stored(new Date(2026, 8, 12, 9, 0)), now)).toBe(
      'Sep 12',
    )
    expect(daysAgoLabel(stored(new Date(2025, 11, 30, 9, 0)), now)).toBe(
      'Dec 30, 2025',
    )
  })

  it('is empty without a date', () => {
    expect(daysAgoLabel(undefined, now)).toBe('')
    expect(daysAgoLabel('soon', now)).toBe('')
  })
})

describe('a count of tracks', () => {
  it('reads as one track or N tracks, with thousands separated', () => {
    expect(trackCount(1)).toBe('1 track')
    expect(trackCount(0)).toBe('0 tracks')
    expect(trackCount(1581)).toBe('1,581 tracks')
  })
})
