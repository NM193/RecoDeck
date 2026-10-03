// src/lib/youtube-music/rows.test.ts
import { describe, expect, it } from 'vitest'
import {
  classifyYouTubeMusic,
  isSet,
  listCounts,
  rowsFor,
  syncErrorText,
  unavailableCount,
} from './rows'
import { buildOwnershipIndex, type Ownership } from '../spotify/ownership'
import type { LibraryTrack } from '../tracklist/match'
import type { YtmLibrary, YtmTrack } from '../../types/youtubeMusic'

const MIN = 60_000

const library: YtmLibrary = {
  lists: [
    { id: 'LM', name: 'Liked music', position: 0, trackCount: 4, totalResults: 6, lastOpenedAt: 1000, unavailableAt: null },
    { id: 'PL1', name: 'Deep', position: 1, trackCount: 2, totalResults: 2, lastOpenedAt: 1000, unavailableAt: null },
  ],
  tracks: [
    { videoId: 'v1', title: 'Soulva - Odyssey (Original Mix)', channel: 'Soulva', durationMs: 7 * MIN },
    { videoId: 'v2', title: 'Nina Kraviz - Tarde (Monthy Nolan Edit)', channel: 'Label', durationMs: 6 * MIN },
    { videoId: 'set1', title: 'Dan Ghenacia | Live Vinyl DJ Set | Micas Garten | UNDRSTND', channel: 'UNDRSTND', durationMs: 95 * MIN },
    { videoId: 'v3', title: 'Honey Hunter', channel: 'Extrawelt - Topic', durationMs: null },
  ],
  entries: [
    { listId: 'LM', videoId: 'v1', addedAt: '2026-10-02T10:00:00Z', firstSeenAt: 1000 },
    { listId: 'LM', videoId: 'v2', addedAt: '2026-10-03T10:00:00Z', firstSeenAt: 2000 },
    { listId: 'LM', videoId: 'set1', addedAt: '2026-10-03T11:00:00Z', firstSeenAt: 2000 },
    { listId: 'LM', videoId: 'v3', addedAt: '2026-09-01T10:00:00Z', firstSeenAt: 1000 },
    { listId: 'PL1', videoId: 'v1', addedAt: '2026-10-03T12:00:00Z', firstSeenAt: 1000 },
    { listId: 'PL1', videoId: 'set1', addedAt: '2026-09-01T00:00:00Z', firstSeenAt: 2000 },
  ],
  verdicts: [],
}

const none = new Map<string, Ownership>()
const opened = new Map<string, number>()

function video(videoId: string, durationMs: number | null): YtmTrack {
  return { videoId, title: 'A - B', channel: 'C', durationMs }
}

describe('sets and tracks', () => {
  it('takes only what runs longer than 20 minutes for a set', () => {
    expect(isSet(video('a', 20 * MIN))).toBe(false)
    expect(isSet(video('b', 20 * MIN + 1))).toBe(true)
    expect(isSet(video('c', null))).toBe(false)
  })
})

describe('the rows of a list', () => {
  it('lists tracks newest added first, with the sets apart', () => {
    const { rows, sets } = rowsFor('LM', library, none, opened)
    expect(rows.map((r) => r.track.videoId)).toEqual(['v2', 'v1', 'v3'])
    expect(sets.map((s) => s.track.videoId)).toEqual(['set1'])
    expect(rows.map((r) => r.isNew)).toEqual([true, false, false])
  })

  it('shows the title and artist read from the YouTube title', () => {
    const { rows } = rowsFor('LM', library, none, opened)
    expect(rows[0]).toMatchObject({ title: 'Tarde (Monthy Nolan Edit)', artist: 'Nina Kraviz' })
    expect(rows[2]).toMatchObject({ title: 'Honey Hunter', artist: 'Extrawelt' })
  })

  it('makes All playlists one row per video, with every list and its newest add', () => {
    const { rows, sets } = rowsFor('all', library, none, opened)
    expect(rows.map((r) => r.track.videoId)).toEqual(['v1', 'v2', 'v3'])
    expect(rows[0]).toMatchObject({
      addedAt: '2026-10-03T12:00:00Z',
      lists: ['Liked music', 'Deep'],
    })
    expect(sets).toHaveLength(1)
    expect(sets[0].addedAt).toBe('2026-10-03T11:00:00Z')
  })

  it('never puts the dot on an owned track', () => {
    const owned = new Map<string, Ownership>([['v2', { kind: 'owned' }]])
    expect(rowsFor('LM', library, owned, opened).rows[0].isNew).toBe(false)
  })
})

describe('the footer and the sidebar counts', () => {
  it('counts what YouTube lists but RecoDeck skipped', () => {
    expect(unavailableCount('LM', library)).toBe(2)
    expect(unavailableCount('PL1', library)).toBe(0)
    expect(unavailableCount('all', library)).toBe(2)
    const unread: YtmLibrary = {
      ...library,
      lists: [{ ...library.lists[0], totalResults: null }],
    }
    expect(unavailableCount('LM', unread)).toBe(0)
  })

  it('leaves sets out of every count', () => {
    expect(listCounts(library)).toEqual(
      new Map([
        ['all', 3],
        ['LM', 3],
        ['PL1', 1],
      ]),
    )
  })
})

describe('do I own it', () => {
  const shelf: LibraryTrack[] = [
    { id: 1, artist: 'Soulva', title: 'Odyssey (Original Mix)', file_path: '/m/1.mp3' },
    { id: 2, artist: 'Some Producer', title: 'Honey Hunter', file_path: '/m/2.mp3' },
  ]
  const tracks: YtmTrack[] = [
    ...library.tracks,
    { videoId: 'v4', title: 'Honey Hunter', channel: 'Some Uploader', durationMs: 5 * MIN },
  ]

  it('matches tracks, lets a bare title be a Maybe, and leaves sets alone', () => {
    const result = classifyYouTubeMusic(tracks, buildOwnershipIndex(shelf), [])
    expect(result.get('v1')).toEqual({ kind: 'owned', file: shelf[0] })
    // The Topic channel names Extrawelt, whom the file does not.
    expect(result.get('v3')).toEqual({ kind: 'missing' })
    expect(result.get('v4')).toEqual({
      kind: 'maybe',
      file: shelf[1],
      reason: 'same title, artist unknown',
    })
    expect(result.has('set1')).toBe(false)
  })

  it('takes a Yes', () => {
    const result = classifyYouTubeMusic(tracks, buildOwnershipIndex(shelf), [
      { videoId: 'v4', libraryTrackId: 2, verdict: 'yes' },
    ])
    expect(result.get('v4')).toEqual({ kind: 'owned', file: shelf[1] })
  })
})

describe('the meta line on a failed sync', () => {
  it('words each kind', () => {
    expect(syncErrorText('network')).toBe("couldn't reach YouTube")
    expect(syncErrorText('quotaExceeded')).toBe(
      'YouTube quota used up · resumes after midnight Pacific',
    )
    expect(syncErrorText('other')).toBe('sync failed — see Settings → YouTube Music')
    expect(syncErrorText(null)).toBe('sync failed — see Settings → YouTube Music')
  })
})
