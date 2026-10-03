// src/lib/dj/plays.test.ts
import { describe, expect, it } from 'vitest'
import { countPlays, playOwnership, playSearchUrl, playText } from './plays'
import { buildOwnershipIndex } from '../spotify/ownership'
import type { DjSetTrack } from '../../types/dj'

function row(
  videoId: string,
  artist: string | null,
  title: string,
  mix: string | null = null,
  isUnknown = false,
): DjSetTrack {
  return { videoId, artist, title, mix, isUnknown }
}

describe('what a DJ plays', () => {
  const rows = [
    row('s1', 'Joey Purp', 'Elastic'),
    row('s1', 'Joey Purp', 'Elastic'), // named twice in one set: still one set
    row('s2', 'JOEY PURP', 'Elastic'), // spelt differently: the same track
    row('s3', 'Joey Purp', 'Elastic'),
    row('s1', 'Santos', 'Hold Home'),
    row('s2', 'Santos', 'Hold Home'),
    row('s2', 'Candido', 'Jingo', 'Dr Packer Rework'),
    row('s3', 'Candido', 'Jingo'), // another version is another record
    row('s1', 'ID', 'ID', null, true),
    row('s2', 'ID', 'ID', null, true),
  ]

  it('counts each track once per set, most-played first', () => {
    expect(
      countPlays(rows).map((p) => [p.artist, p.title, p.mix, p.count]),
    ).toEqual([
      ['Joey Purp', 'Elastic', null, 3],
      ['Santos', 'Hold Home', null, 2],
      ['Candido', 'Jingo', null, 1],
      ['Candido', 'Jingo', 'Dr Packer Rework', 1],
    ])
  })

  it('leaves out IDs and nameless rows', () => {
    expect(
      countPlays([
        row('s1', 'ID', 'ID', null, true),
        row('s1', 'Someone', '  '),
      ]),
    ).toEqual([])
  })

  it('is Owned, Maybe or Missing by the library matcher', () => {
    const index = buildOwnershipIndex([
      {
        id: 1,
        artist: 'Santos',
        title: 'Hold Home (Original Mix)',
        file_path: '/m/a.mp3',
      },
    ])
    const [, santos, jingo] = countPlays(rows)
    expect(playOwnership(santos, index)).toMatchObject({
      kind: 'owned',
      file: { id: 1 },
    })
    expect(playOwnership(jingo, index)).toEqual({ kind: 'missing' })
  })

  it('copies "Artist - Title (Mix)" and searches SelectedRecs without the mix', () => {
    const play = {
      key: 'k',
      artist: 'Candido',
      title: 'Jingo',
      mix: 'Dr Packer Rework',
      count: 2,
    }
    expect(playText(play)).toBe('Candido - Jingo (Dr Packer Rework)')
    expect(playText({ ...play, artist: null, mix: null })).toBe('Jingo')
    expect(playSearchUrl(play)).toBe(
      'https://srv.selectedrecs.com/#/search?text=Candido%20-%20Jingo',
    )
  })
})
