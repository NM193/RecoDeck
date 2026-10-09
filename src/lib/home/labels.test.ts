import { describe, expect, it } from 'vitest'
import {
  addedLabel,
  bpmBars,
  bpmLabel,
  busiestList,
  gigDay,
  gigLine,
  gigWhere,
  keyKnownLine,
  lastPlaylistLine,
  libraryStats,
  moreRowsLine,
  needsYouRows,
  newSetCost,
  newSetLine,
  newLikeRows,
  playedLabel,
  type StreamNews,
} from './labels'
import { matchesTrackFilter } from '../trackTable/filter'
import type { BpmRangeCount, NewDjFind, NewDjFinds, UpcomingGig } from '../../types/home'
import type { Track } from '../../types/track'

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

const newSet = (videoId: string, displayName: string): NewDjFind => ({
  videoId,
  nameKey: displayName.toLowerCase(),
  displayName,
  title: `${displayName} live`,
  channel: null,
  saved: false,
})

const noSets: NewDjFinds = { total: 0, finds: [] }

describe('needsYouRows', () => {
  it('lists the news in the spec’s order', () => {
    const rows = needsYouRows({
      spotify: news(3, { liked: 3 }),
      youtubeMusic: news(1, { p1: 1 }),
      newSets: { total: 2, finds: [newSet('v1', 'Hot Since 82'), newSet('v2', 'Hot Since 82')] },
      notAnalyzed: 223,
      nextGig: gig,
      today: '2026-10-04',
    })
    expect(rows).toEqual([
      { kind: 'spotify', number: '3', text: "New Spotify likes you don't own", place: 'Liked Songs', listId: 'liked' },
      { kind: 'youtube-music', number: '1', text: 'New YouTube Music like', place: 'Warm-up', listId: 'p1' },
      { kind: 'new-sets', number: '2', text: 'New sets by Hot Since 82', place: 'Sets' },
      { kind: 'not-analyzed', number: '223', text: 'Tracks not analyzed', place: 'Analyze all' },
      { kind: 'next-gig', number: 'Tue', text: 'Traumer plays Hï Ibiza', place: 'Oct 6', djName: 'Traumer' },
    ])
  })

  it('leaves out a row whose number is 0, and a service not shown in the sidebar', () => {
    const rows = needsYouRows({
      spotify: news(0, {}),
      youtubeMusic: null,
      newSets: noSets,
      notAnalyzed: 0,
      nextGig: null,
      today: '2026-10-04',
    })
    expect(rows).toEqual([])
  })

  it('names the DJ of the new sets only when every one was read and they are all theirs', () => {
    const text = (newSets: NewDjFinds) =>
      needsYouRows({ spotify: null, youtubeMusic: null, newSets, notAnalyzed: 0, nextGig: null, today: '2026-10-04' })[0]
        .text
    expect(text({ total: 1, finds: [newSet('v1', 'Traumer')] })).toBe('New set by Traumer')
    expect(text({ total: 2, finds: [newSet('v1', 'Traumer'), newSet('v2', 'Solomun')] })).toBe('New sets')
    // 21 unseen, 20 read: the 21st may be another DJ's.
    const twenty = Array.from({ length: 20 }, (_, i) => newSet(`v${i}`, 'Traumer'))
    expect(text({ total: 21, finds: twenty })).toBe('New sets')
  })

  it('says where a gig is without a venue, and the year when it is not this one', () => {
    const [row] = needsYouRows({
      spotify: null,
      youtubeMusic: null,
      newSets: noSets,
      notAnalyzed: 0,
      nextGig: { ...gig, date: '2027-01-02', venue: null, city: null },
      today: '2026-10-04',
    })
    expect(row).toMatchObject({ number: 'Sat', text: 'Traumer has a gig', place: 'Jan 2, 2027' })
  })
})

describe('new set rows', () => {
  it('read "DJ · channel", the channel once when it is the DJ’s own', () => {
    expect(newSetLine({ displayName: 'Hot Since 82', channel: 'Cercle' })).toBe('Hot Since 82 · Cercle')
    expect(newSetLine({ displayName: 'Hot Since 82', channel: 'HOT SINCE 82' })).toBe('Hot Since 82')
    expect(newSetLine({ displayName: 'Traumer', channel: null })).toBe('Traumer')
  })

  it('say what opening one costs', () => {
    expect(newSetCost({ saved: true })).toBe('saved')
    expect(newSetCost({ saved: false })).toBe('5–7 units')
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

describe('addedLabel', () => {
  // SQLite's UTC text for a local time.
  const stored = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')
  const now = new Date(2026, 9, 8, 23, 30)

  it('says when a track was added as the played time does', () => {
    expect(addedLabel(stored(new Date(2026, 9, 8, 9, 5)), now)).toBe('09:05')
    expect(addedLabel(stored(new Date(2026, 9, 7, 23, 58)), now)).toBe('yesterday')
    expect(addedLabel(stored(new Date(2026, 9, 2, 9)), now)).toBe('Oct 2')
  })

  it('shows a dash for a date it cannot read', () => {
    expect(addedLabel(undefined, now)).toBe('—')
    expect(addedLabel('soon', now)).toBe('—')
  })
})

describe('lastPlaylistLine', () => {
  const now = new Date(2026, 9, 8, 23, 30)

  it('counts the tracks and says when the playlist was played', () => {
    expect(lastPlaylistLine(10, at(2026, 10, 2, 9), now)).toBe('10 tracks · played Oct 2')
    expect(lastPlaylistLine(1, at(2026, 10, 7, 20), now)).toBe('1 track · played yesterday')
    expect(lastPlaylistLine(1581, at(2026, 10, 8, 22, 39), now)).toBe('1,581 tracks · played at 22:39')
  })
})

describe('moreRowsLine', () => {
  it('says how many rows a card leaves out, or nothing when it shows them all', () => {
    expect(moreRowsLine(2000, 100)).toBe('and 1,900 more')
    expect(moreRowsLine(101, 100)).toBe('and 1 more')
    expect(moreRowsLine(100, 100)).toBeNull()
    expect(moreRowsLine(40, 100)).toBeNull()
  })
})

describe('newLikeRows', () => {
  it('lists each list with new likes, Spotify first, in the sidebar order', () => {
    expect(newLikeRows(news(5, { p2: 3, liked: 2 }), news(1, { p1: 1 }))).toEqual([
      { service: 'spotify', listId: 'liked', name: 'Liked Songs', number: '2' },
      { service: 'spotify', listId: 'p2', name: 'Peak', number: '3' },
      { service: 'youtube-music', listId: 'p1', name: 'Warm-up', number: '1' },
    ])
  })

  it('leaves out lists with none, and a service not shown in the sidebar', () => {
    expect(newLikeRows(null, news(0, {}))).toEqual([])
    expect(newLikeRows(news(2, { p1: 2 }), null)).toEqual([
      { service: 'spotify', listId: 'p1', name: 'Warm-up', number: '2' },
    ])
  })
})

describe('bpmBars', () => {
  const ranges: BpmRangeCount[] = [
    { min: null, max: 115, count: 12 },
    { min: 115, max: 120, count: 40 },
    { min: 120, max: 125, count: 0 },
    { min: 135, max: null, count: 3 },
  ]

  it('labels each half-open range and sets its filter', () => {
    expect(bpmBars(ranges).map(({ label, count, filter }) => [label, count, filter])).toEqual([
      ['< 115', 12, { bpmMax: 115 }],
      ['115–119', 40, { bpmMin: 115, bpmMax: 120 }],
      ['120–124', 0, { bpmMin: 120, bpmMax: 125 }],
      ['135+', 3, { bpmMin: 135 }],
    ])
  })

  it('opens All Tracks on the tracks it counts, at the edges', () => {
    const [below, from115, , from135] = bpmBars(ranges)
    const shows = (bpm: number) =>
      [below, from115, from135]
        .filter((bar) => matchesTrackFilter({ bpm } as Track, bar.filter, { playedIds: null }))
        .map((bar) => bar.label)
    expect(shows(114.9)).toEqual(['< 115'])
    expect(shows(115)).toEqual(['115–119'])
    expect(shows(119.9)).toEqual(['115–119'])
    expect(shows(135)).toEqual(['135+'])
  })
})

describe('keyKnownLine', () => {
  it('counts the tracks with a key', () => {
    expect(keyKnownLine([{ count: 60 }, { count: 37 }])).toBe('key known for 97 tracks')
    expect(keyKnownLine([{ count: 1 }])).toBe('key known for 1 track')
  })
})
