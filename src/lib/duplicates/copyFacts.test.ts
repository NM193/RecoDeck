import { describe, expect, it } from 'vitest'
import type { DuplicateGroup, DuplicateTrack } from '../../types/track'
import { copyFacts, copyPlace } from './copyFacts'

function copy(id: number, extra: Partial<DuplicateTrack> = {}): DuplicateTrack {
  return {
    id,
    file_path: `/m/${id}/Song.mp3`,
    file_hash: String(id),
    play_count: 0,
    rating: 0,
    title: 'Song',
    artist: 'K',
    file_format: 'mp3',
    bitrate: 320,
    duration_ms: 352_000,
    file_size: 14_260_633,
    playlists: [],
    analyzed: true,
    plays: 0,
    file_missing: false,
    ...extra,
  }
}

function group(tracks: DuplicateTrack[]): DuplicateGroup {
  return {
    detection_reason: 'identical_content',
    recommended_keep_id: tracks[0].id,
    recommend_reason: 'added first',
    tracks,
  }
}

describe('copyFacts', () => {
  it('puts what every copy shares in one line, and nothing per copy', () => {
    const f = copyFacts(group([copy(1), copy(2)]))
    expect(f.heading).toBe('Song — K')
    expect(f.shared).toEqual(['MP3 320', '5:52', '13.6 MB', 'analyzed'])
    expect(f.differ.get(1)).toEqual([])
    expect(f.differ.get(2)).toEqual([])
  })

  it('shows per copy only the facts that differ', () => {
    const f = copyFacts(
      group([
        copy(1, { file_format: 'wav', bitrate: 1411, file_size: 69_000_000 }),
        copy(2, { analyzed: false }),
      ]),
    )
    expect(f.shared).toEqual(['5:52'])
    expect(f.differ.get(1)).toEqual(['WAV', '65.8 MB', 'analyzed'])
    expect(f.differ.get(2)).toEqual(['MP3 320', '13.6 MB', 'not analyzed'])
  })

  it('shows a copy its own title and artist when the tags differ', () => {
    const f = copyFacts(
      group([copy(1), copy(2, { title: 'Song (Radio Edit)' })]),
    )
    expect(f.heading).toBe('Song — K')
    expect(f.differ.get(1)).toEqual([])
    expect(f.differ.get(2)).toEqual(['Song (Radio Edit) — K'])
  })

  it('names missing tags instead of leaving them blank', () => {
    const f = copyFacts(group([copy(1, { title: '', artist: undefined })]))
    expect(f.heading).toBe('Untitled — Unknown artist')
  })
})

describe('copyPlace', () => {
  it('splits a path into its folder and its file name', () => {
    expect(copyPlace('/m/Deep Tech/Song.mp3')).toEqual({
      folder: 'Deep Tech',
      file: 'Song.mp3',
    })
    expect(copyPlace('Song.mp3')).toEqual({ folder: '', file: 'Song.mp3' })
  })
})
