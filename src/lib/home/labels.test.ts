import { describe, expect, it } from 'vitest'
import { bpmLabel, busiestList, gigDay, gigLine, gigWhere, libraryStats, needsYouRows, playedLabel, type StreamNews } from './labels'
import type { UpcomingGig } from '../../types/home'

// Local times, so the tests read the same in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime() / 1000

describe('bpmLabel', () => {
  it('shows whole beats, or a dash without a BPM', () => {
    expect(bpmLabel(124.6)).toBe('125')
    expect(bpmLabel(undefined)).toBe('—')
    expect(bpmLabel(0)).toBe('—')
  })
})

describe('playedLabel', () => {
  const now = new Date(2026, 9, 8, 23, 30)

  it('shows the time today, "yesterday", then the date', () => {
    expect(playedLabel(at(2026, 10, 8, 22, 39), now)).toBe('22:39')
    expect(playedLabel(at(2026, 10, 8, 0, 5), now)).toBe('00:05')
    expect(playedLabel(at(2026, 10, 7, 23, 59), now)).toBe('yesterday')
    expect(playedLabel(at(2026, 10, 2, 9), now)).toBe('Oct 2')
    expect(playedLabel(at(2025, 12, 31, 9), now)).toBe('Dec 31, 2025')
  })

  it('goes by the local day of a UTC time just before local midnight', () => {
    // 23:58 local yesterday, whatever UTC day that is.
    const late = at(2026, 10, 7, 23, 58)
    expect(playedLabel(late, new Date(2026, 9, 8, 0, 1))).toBe('yesterday')
    expect(playedLabel(late, new Date(2026, 9, 7, 23, 59))).toBe('23:58')
  })
})

const lists = [
  { id: 'liked', name: 'Liked Songs', position: 0 },
  { id: 'p1', name: 'Warm-up', position: 1 },
  { id: 'p2', name: 'Peak', position: 2 },
]
const news = (total: number, byList: Record<string, number>): StreamNews => ({
  total,
  byList: new Map(Object.entries(byList)),
  lists,
})

describe('busiestList', () => {
  it('is the list with the most new likes, the first in the sidebar on a tie', () => {
    expect(busiestList(news(5, { p1: 2, p2: 3 }))).toEqual({ id: 'p2', name: 'Peak' })
    expect(busiestList(news(4, { p2: 2, liked: 2 }))).toEqual({ id: 'liked', name: 'Liked Songs' })
    expect(busiestList(news(0, {}))).toBeNull()
  })
})

const gig: UpcomingGig = {
  nameKey: 'traumer',
  displayName: 'Traumer',
  eventId: 'e2',
  date: '2026-10-06',
  venue: 'Hï Ibiza',
  city: 'Ibiza',
  country: 'ES',
}

describe('needsYouRows', () => {
  it('lists the news in the spec’s order', () => {
    const rows = needsYouRows({
      spotify: news(3, { liked: 3 }),
      youtubeMusic: news(1, { p1: 1 }),
      notAnalyzed: 223,
      nextGig: gig,
      today: '2026-10-04',
    })
    expect(rows).toEqual([
      { kind: 'spotify', number: '3', text: "New Spotify likes you don't own", place: 'Liked Songs', listId: 'liked' },
      { kind: 'youtube-music', number: '1', text: 'New YouTube Music like', place: 'Warm-up', listId: 'p1' },
      { kind: 'not-analyzed', number: '223', text: 'Tracks not analyzed', place: 'Analyze all' },
      { kind: 'next-gig', number: 'Tue', text: 'Traumer plays Hï Ibiza', place: 'Oct 6', djName: 'Traumer' },
    ])
  })

  it('leaves out a row whose number is 0, and a service not shown in the sidebar', () => {
    const rows = needsYouRows({ spotify: news(0, {}), youtubeMusic: null, notAnalyzed: 0, nextGig: null, today: '2026-10-04' })
    expect(rows).toEqual([])
  })

  it('says where a gig is without a venue, and the year when it is not this one', () => {
    const [row] = needsYouRows({
      spotify: null,
      youtubeMusic: null,
      notAnalyzed: 0,
      nextGig: { ...gig, date: '2027-01-02', venue: null, city: null },
      today: '2026-10-04',
    })
    expect(row).toMatchObject({ number: 'Sat', text: 'Traumer has a gig', place: 'Jan 2, 2027' })
  })
})

describe('gig rows', () => {
  it('read "DJ · venue" over "city, country"', () => {
    expect(gigLine(gig)).toBe('Traumer · Hï Ibiza')
    expect(gigLine({ ...gig, venue: null })).toBe('Traumer')
    expect(gigWhere(gig)).toBe('Ibiza, ES')
    expect(gigWhere({ city: null, country: 'ES' })).toBe('ES')
  })

  it('show the date as a day over a month', () => {
    expect(gigDay('2026-10-06')).toEqual({ day: '06', month: 'OCT' })
    expect(gigDay('2026-12-31T23:00:00')).toEqual({ day: '31', month: 'DEC' })
    expect(gigDay('soon')).toBeNull()
  })
})

describe('libraryStats', () => {
  const counts = { tracks: 8583, playlists: 24, folders: 1, addedLately: 359, neverPlayed: 8142 }

  it('shows the track count and the added lately at one column', () => {
    expect(libraryStats(1, counts)).toEqual({ figures: [{ value: '8,583', label: 'tracks' }], line: '359 added lately' })
  })

  it('shows tracks, playlists and folders at two columns and wider', () => {
    expect(libraryStats(2, counts)).toEqual({
      figures: [
        { value: '8,583', label: 'tracks' },
        { value: '24', label: 'playlists' },
        { value: '1', label: 'folder' },
      ],
      line: '359 added lately · 8,142 never played',
    })
  })

  it('leaves the line out until the groups are read', () => {
    expect(libraryStats(4, { ...counts, addedLately: null, neverPlayed: null }).line).toBe('')
  })
})
