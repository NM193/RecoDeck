import { describe, expect, it } from 'vitest'
import {
  filterCounts,
  filterRows,
  heroNumbers,
  missingTracks,
  savedList,
  savedLabel,
  sourceLine,
  thumbnailUrl,
  trackLine,
} from './setPage'
import type { MatchSummary } from '../tracklist/match'
import type { Track, TracklistResult } from '../tracklist'

const track = (index: number, over: Partial<Track> = {}): Track =>
  ({ index, cue: '', cueMs: index * 60_000, artist: `Artist ${index}`, title: `Title ${index}`, mix: null, isUnknown: false, ...over } as Track)

// 1 owned, 2 and 4 missing, 3 an ID.
const tracks = [track(1), track(2, { mix: 'Club Mix' }), track(3, { isUnknown: true, artist: null, title: 'ID' }), track(4, { artist: null })]
const matches = { byIndex: new Map([[1, {}]]), owned: 1, missing: 2 } as unknown as MatchSummary

const result = (over: Partial<TracklistResult> = {}): TracklistResult =>
  ({ status: 'ok', source: 'description', sourceMeta: null, sourceCount: 3, tracks, ...over } as TracklistResult)

describe('heroNumbers', () => {
  it('reads tracks, lists, you own, missing and IDs', () => {
    expect(heroNumbers(result(), matches).map((n) => `${n.value} ${n.label}`)).toEqual([
      '4 tracks',
      '3 lists',
      '1 you own',
      '2 missing',
      '1 ID',
    ])
    expect(heroNumbers(result(), matches).find((n) => n.key === 'owned')?.owned).toBe(true)
  })

  it('leaves out the parts with nothing in them', () => {
    const one = result({ sourceCount: 1, tracks: [track(1)] })
    expect(heroNumbers(one, null).map((n) => `${n.value} ${n.label}`)).toEqual(['1 track', '1 list'])
    expect(heroNumbers(result({ sourceCount: 0, tracks: [] }), null)).toEqual([])
  })
})

describe('sourceLine', () => {
  it('says how many lists and the strongest source', () => {
    expect(sourceLine(result())).toBe('from 3 crossed lists · strongest source: the description')
    expect(sourceLine(result({ sourceCount: 1, source: 'comment', sourceMeta: { author: '@dj_nerd', likeCount: 4 } }))).toBe(
      'from 1 list · strongest source: comment by @dj_nerd',
    )
  })

  it('adds the status when the list is not a plain one, and is empty with no tracklist', () => {
    // Assembled from comments: no lists were found to count.
    expect(sourceLine(result({ status: 'assembled', source: null, sourceCount: 0 }))).toBe('assembled from comments')
    expect(sourceLine(result({ status: 'low_confidence' }))).toContain('· low confidence')
    expect(sourceLine(result({ tracks: [] }))).toBe('')
  })
})

describe('the filter', () => {
  it('counts the rows each shows, an ID only under IDs', () => {
    expect(filterCounts(tracks, matches)).toEqual({ all: 4, have: 1, missing: 2, ids: 1 })
  })

  it('shows those rows in the set’s order', () => {
    expect(filterRows(tracks, matches, 'all').map((t) => t.index)).toEqual([1, 2, 3, 4])
    expect(filterRows(tracks, matches, 'have').map((t) => t.index)).toEqual([1])
    expect(filterRows(tracks, matches, 'missing').map((t) => t.index)).toEqual([2, 4])
    expect(filterRows(tracks, matches, 'ids').map((t) => t.index)).toEqual([3])
  })

  it('takes every named row as missing until the match is in', () => {
    expect(filterCounts(tracks, null)).toEqual({ all: 4, have: 0, missing: 3, ids: 1 })
  })
})

describe('copying the missing tracks', () => {
  it('writes "Artist - Title (Mix)" per line', () => {
    expect(trackLine(tracks[1])).toBe('Artist 2 - Title 2 (Club Mix)')
    expect(missingTracks(tracks, matches)).toEqual(['Artist 2 - Title 2 (Club Mix)', 'Title 4'])
  })

  it('writes the saved tracks the same way', () => {
    expect(savedList([{ artist: 'Tuccillo', title: 'Imagination Engine' }, { title: 'Bomba', mix: 'Dub' }])).toBe(
      'Tuccillo - Imagination Engine\nBomba (Dub)',
    )
  })
})

describe('labels', () => {
  it('builds the thumbnail address', () => {
    expect(thumbnailUrl('AvoifrdCfFM')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/hqdefault.jpg')
    expect(thumbnailUrl('AvoifrdCfFM', 'mqdefault')).toBe('https://i.ytimg.com/vi/AvoifrdCfFM/mqdefault.jpg')
  })

  it('says when the set was saved, with the year when it is not this one', () => {
    // SQLite's UTC text for a local time, so the day holds in any time zone.
    const stored = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ')
    const now = new Date(2026, 9, 8)
    expect(savedLabel(stored(new Date(2026, 8, 27, 12)), now)).toBe('saved Sep 27')
    expect(savedLabel(stored(new Date(2025, 11, 31, 12)), now)).toBe('saved Dec 31, 2025')
    expect(savedLabel(undefined, now)).toBeNull()
  })
})
