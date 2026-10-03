// src/lib/spotify/rows.test.ts
import { describe, expect, it } from 'vitest'
import {
  countByStatus,
  fileName,
  filterRows,
  filterRowsBy,
  formatAdded,
  formatSynced,
  listCounts,
  rowsFor,
  syncErrorText,
} from './rows'
import type { Ownership } from './ownership'
import type { SpotifyLibrary } from '../../types/spotify'

const library: SpotifyLibrary = {
  lists: [
    {
      id: 'liked',
      name: 'Liked Songs',
      position: 0,
      trackCount: 2,
      lastOpenedAt: 1000,
    },
    {
      id: 'p1',
      name: 'Tech House',
      position: 1,
      trackCount: 2,
      lastOpenedAt: 1000,
    },
  ],
  tracks: [
    {
      spotifyId: 't1',
      title: 'Control',
      artists: 'Joseph Capriati',
      album: 'Control EP',
      durationMs: null,
    },
    {
      spotifyId: 't2',
      title: 'Reverse Things',
      artists: 'Makèz, Toman',
      album: null,
      durationMs: null,
    },
    {
      spotifyId: 't3',
      title: 'Come Get Up',
      artists: 'Butch',
      album: null,
      durationMs: null,
    },
  ],
  entries: [
    {
      listId: 'p1',
      spotifyId: 't1',
      addedAt: '2026-09-20T10:00:00Z',
      firstSeenAt: 1000,
    },
    {
      listId: 'liked',
      spotifyId: 't1',
      addedAt: '2026-09-01T10:00:00Z',
      firstSeenAt: 1000,
    },
    {
      listId: 'liked',
      spotifyId: 't2',
      addedAt: '2026-09-10T10:00:00Z',
      firstSeenAt: 2000,
    },
    { listId: 'p1', spotifyId: 't3', addedAt: null, firstSeenAt: 2000 },
  ],
  verdicts: [],
}

const ownership = new Map<string, Ownership>([
  ['t1', { kind: 'missing' }],
  ['t2', { kind: 'maybe' }],
  ['t3', { kind: 'owned' }],
])

describe('the rows of a list', () => {
  it('lists one list, newest added first', () => {
    const rows = rowsFor('liked', library, ownership, new Map())
    expect(rows.map((r) => r.track.spotifyId)).toEqual(['t2', 't1'])
  })

  it('in All playlists shows a track once, with its newest added date and every list it is in', () => {
    const rows = rowsFor('all', library, ownership, new Map())
    expect(rows.map((r) => r.track.spotifyId)).toEqual(['t1', 't2', 't3'])
    expect(rows[0].addedAt).toBe('2026-09-20T10:00:00Z')
    expect(rows[0].lists).toEqual(['Liked Songs', 'Tech House'])
  })

  it('marks a new track that is not owned', () => {
    const rows = rowsFor('liked', library, ownership, new Map())
    expect(rows.find((r) => r.track.spotifyId === 't2')?.isNew).toBe(true)
    expect(rows.find((r) => r.track.spotifyId === 't1')?.isNew).toBe(false)
  })

  it('never marks an owned track new', () => {
    const rows = rowsFor('p1', library, ownership, new Map())
    expect(rows.find((r) => r.track.spotifyId === 't3')?.isNew).toBe(false)
  })

  it('compares with the opening captured when the view was opened, not the one just written', () => {
    const rows = rowsFor(
      'liked',
      library,
      ownership,
      new Map([['liked', 2500]]),
    )
    expect(rows.find((r) => r.track.spotifyId === 't2')?.isNew).toBe(false)
  })

  it('counts each status, and filters by status and by words', () => {
    const rows = rowsFor('all', library, ownership, new Map())
    expect(countByStatus(rows)).toEqual({
      all: 3,
      owned: 1,
      missing: 1,
      maybe: 1,
    })
    expect(
      filterRows(rows, 'missing', '').map((r) => r.track.spotifyId),
    ).toEqual(['t1'])
    // Accents are folded on both sides: typing without them still finds them.
    expect(
      filterRows(rows, 'all', 'makez').map((r) => r.track.spotifyId),
    ).toEqual(['t2'])
    expect(
      filterRows(rows, 'all', 'MAKÈZ').map((r) => r.track.spotifyId),
    ).toEqual(['t2'])
    expect(
      filterRows(rows, 'all', 'toman reverse').map((r) => r.track.spotifyId),
    ).toEqual(['t2'])
    expect(
      filterRows(rows, 'all', 'control ep').map((r) => r.track.spotifyId),
    ).toEqual(['t1'])
  })

  it('counts the rows behind each sidebar item', () => {
    const counts = listCounts(library)
    expect(counts.get('all')).toBe(3)
    expect(counts.get('liked')).toBe(2)
    expect(counts.get('p1')).toBe(2)
  })
})

describe('how times read', () => {
  const now = new Date(2026, 9, 3, 12, 0)

  it('says today, yesterday, a date, or a date with the year', () => {
    expect(formatAdded(new Date(2026, 9, 3, 8).toISOString(), now)).toBe(
      'today',
    )
    expect(formatAdded(new Date(2026, 9, 2, 23).toISOString(), now)).toBe(
      'yesterday',
    )
    expect(formatAdded(new Date(2026, 8, 28, 10).toISOString(), now)).toBe(
      'Sep 28',
    )
    expect(formatAdded(new Date(2024, 8, 28, 10).toISOString(), now)).toBe(
      'Sep 28, 2024',
    )
    expect(formatAdded(null, now)).toBe('')
  })

  it('says how long ago a sync was', () => {
    const t = now.getTime()
    expect(formatSynced(t - 30_000, t)).toBe('just now')
    expect(formatSynced(t - 2 * 60_000, t)).toBe('2 min ago')
    expect(formatSynced(t - 2 * 3_600_000, t)).toBe('2 h ago')
    expect(formatSynced(t - 3 * 86_400_000, t)).toBe('3 d ago')
    expect(formatSynced(t + 5_000, t)).toBe('just now')
  })

  it('shows only the file name of a library path', () => {
    expect(fileName('/music/Butch & Santos - Come Get Up.mp3')).toBe(
      'Butch & Santos - Come Get Up.mp3',
    )
    expect(fileName('C:\\Music\\Track.flac')).toBe('Track.flac')
  })
})

describe('syncErrorText', () => {
  it('says what kind of failure it was', () => {
    expect(syncErrorText('network')).toBe("couldn't reach Spotify")
    expect(syncErrorText('rateLimited')).toBe(
      'Spotify asked to wait — will retry',
    )
    expect(syncErrorText('notOnUserManagement')).toBe(
      "this account isn't added to your Spotify app (User Management)",
    )
    expect(syncErrorText('other')).toBe('sync failed — see Settings → Spotify')
    // A status saved before kinds were kept.
    expect(syncErrorText(null)).toBe('sync failed — see Settings → Spotify')
  })
})

describe('filtering any service’s rows', () => {
  it('filters by status, then by the words it is given for each row', () => {
    const rows = [
      { ownership: { kind: 'missing' as const }, text: 'Nina Kraviz Tarde' },
      { ownership: { kind: 'owned' as const }, text: 'Soulva Odyssey' },
    ]
    const text = (row: (typeof rows)[number]) => row.text
    expect(filterRowsBy(rows, 'all', 'kraviz', text)).toEqual([rows[0]])
    expect(filterRowsBy(rows, 'owned', '', text)).toEqual([rows[1]])
    expect(filterRowsBy(rows, 'missing', 'odyssey', text)).toEqual([])
  })
})
