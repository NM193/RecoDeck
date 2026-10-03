// src/lib/dj/tabs.test.ts
import { describe, expect, it } from 'vitest'
import {
  inSets,
  ownedQueue,
  playShare,
  tracksEmptyText,
  tracksProgress,
  tracksTabState,
} from './tabs'
import { REFRESHING, type DjSourceStatus } from './page'
import type { Ownership } from '../spotify/ownership'

const answered = (outcome: DjSourceStatus['outcome']): DjSourceStatus => ({
  refreshing: false,
  outcome,
  error: outcome === 'failed' ? 'timed out' : null,
})

describe('which state the Tracks tab is in', () => {
  const base = {
    connected: true,
    loaded: true,
    tracks: 0,
    spotify: answered('refreshed'),
  }

  it('asks to connect Spotify when it is not connected', () => {
    expect(tracksTabState({ ...base, connected: false })).toBe('notConnected')
    expect(
      tracksTabState({ ...base, connected: false, spotify: REFRESHING }),
    ).toBe('notConnected')
  })

  it('shows cached rows at once, also while a refresh runs or after it failed', () => {
    expect(tracksTabState({ ...base, tracks: 3, spotify: REFRESHING })).toBe(
      'list',
    )
    expect(
      tracksTabState({ ...base, tracks: 3, spotify: answered('failed') }),
    ).toBe('list')
    expect(tracksTabState({ ...base, tracks: 3, connected: null })).toBe('list')
  })

  it('shows skeleton rows on a first open with nothing cached', () => {
    expect(tracksTabState({ ...base, spotify: REFRESHING })).toBe('skeleton')
    expect(tracksTabState({ ...base, loaded: false })).toBe('skeleton')
    // The connection is not known yet: no "Connect Spotify" flash.
    expect(tracksTabState({ ...base, connected: null })).toBe('skeleton')
  })

  it('is empty once Spotify answered with nothing', () => {
    expect(tracksTabState(base)).toBe('empty')
    expect(tracksTabState({ ...base, spotify: answered('notFound') })).toBe(
      'empty',
    )
  })
})

describe('the Tracks tab’s progress line', () => {
  it('counts releases while a fetch reports them', () => {
    expect(tracksProgress(REFRESHING, { done: 120, total: 400 })).toBe(
      'Loading releases… 120 of 400',
    )
  })

  it('says loading while Spotify is asked, and nothing once it answered', () => {
    expect(tracksProgress(REFRESHING, null)).toBe('Loading releases…')
    expect(tracksProgress(answered('fresh'), null)).toBeNull()
    expect(tracksProgress(answered('failed'), null)).toBeNull()
  })
})

describe('the Tracks tab with no tracks', () => {
  it('says Spotify could not be reached', () => {
    expect(tracksEmptyText(answered('failed'), true)).toBe(
      "Couldn't reach Spotify. The tracks load the next time this page opens.",
    )
    expect(tracksEmptyText(answered('failed'), false)).toMatch(
      /^Couldn't reach Spotify/,
    )
  })

  it('points to "Not this artist?" when no artist is known', () => {
    const text =
      'No Spotify artist by this name. Pick one under ⋯ → Not this artist?'
    expect(tracksEmptyText(answered('notFound'), false)).toBe(text)
    expect(tracksEmptyText(answered('fresh'), false)).toBe(text)
  })

  it('says the artist has none', () => {
    expect(tracksEmptyText(answered('refreshed'), true)).toBe(
      'No tracks of theirs on Spotify.',
    )
  })
})

describe('a Plays row', () => {
  it("draws its bar as the share of the DJ's sets", () => {
    expect(playShare(4, 6)).toBe(67)
    expect(playShare(6, 6)).toBe(100)
    expect(playShare(1, 3)).toBe(33)
  })

  it('never draws past the end, nor with no sets', () => {
    expect(playShare(7, 6)).toBe(100)
    expect(playShare(2, 0)).toBe(0)
  })

  it('reads "in N of M sets"', () => {
    expect(inSets(4, 6)).toBe('in 4 of 6 sets')
    expect(inSets(1, 1)).toBe('in 1 of 1 set')
  })
})

describe('double-clicking an Owned row', () => {
  const file = (id: number) => ({ id, file_path: `/music/${id}.mp3` })
  const rows: Ownership[] = [
    { kind: 'owned', file: file(1) },
    { kind: 'missing' },
    {
      kind: 'maybe',
      file: file(2),
      reason: 'same title, artist partly matches',
    },
    { kind: 'owned', file: file(3) },
  ]

  it('plays its file, queued with the other Owned files on screen', () => {
    expect(ownedQueue(rows, rows[3])).toEqual({
      queue: [file(1), file(3)],
      index: 1,
    })
  })

  it('does nothing for Maybe or Missing', () => {
    expect(ownedQueue(rows, rows[1])).toBeNull()
    expect(ownedQueue(rows, rows[2])).toBeNull()
  })
})
