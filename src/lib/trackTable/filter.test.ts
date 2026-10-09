// src/lib/trackTable/filter.test.ts
import { describe, expect, it } from 'vitest'
import type { Track } from '../../types/track'
import {
  applyTrackFilter,
  filterButtonLabel,
  filterConditionLabels,
  isEmptyFilter,
  parseBpmInput,
  parseUtcDate,
  trackFacets,
  withFilterField,
  type FilterContext,
  type TrackFilter,
} from './filter'

let nextId = 1
function track(fields: Partial<Track> = {}): Track {
  const id = nextId++
  return {
    id,
    file_path: `/music/${id}.mp3`,
    file_hash: `hash-${id}`,
    play_count: 0,
    rating: 0,
    ...fields,
  }
}

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0)
const context: FilterContext = { playedIds: null, now: NOW }
const ids = (tracks: Track[]) => tracks.map((t) => t.id)

describe('the track filter', () => {
  it('keeps every track with no filter, or an empty one', () => {
    const tracks = [track(), track()]
    expect(applyTrackFilter(tracks, null, context)).toBe(tracks)
    expect(applyTrackFilter(tracks, {}, context)).toBe(tracks)
  })

  it('matches the genre exactly', () => {
    const house = track({ genre: 'House' })
    const deep = track({ genre: 'Deep House' })
    expect(ids(applyTrackFilter([house, deep, track()], { genre: 'House' }, context))).toEqual([
      house.id,
    ])
  })

  describe('BPM', () => {
    const tracks = [124.99, 125, 129.99, 130].map((bpm) => track({ bpm }))
    const bpms = (filter: TrackFilter) =>
      applyTrackFilter(tracks, filter, context).map((t) => t.bpm)

    it('125–129 holds 125 up to just under 130', () => {
      expect(bpms({ bpmMin: 125, bpmMax: 130 })).toEqual([125, 129.99])
    })

    it('takes a minimum alone', () => {
      expect(bpms({ bpmMin: 125 })).toEqual([125, 129.99, 130])
    })

    it('takes a maximum alone', () => {
      expect(bpms({ bpmMax: 130 })).toEqual([124.99, 125, 129.99])
    })

    it('leaves out a track with no BPM', () => {
      expect(applyTrackFilter([track()], { bpmMin: 0 }, context)).toEqual([])
    })
  })

  it('matches the key exactly', () => {
    const a = track({ musical_key: '6A' })
    const b = track({ musical_key: '6B' })
    expect(ids(applyTrackFilter([a, b, track()], { key: '6A' }, context))).toEqual([a.id])
  })

  describe('Added', () => {
    it('reads the stored time as UTC', () => {
      expect(parseUtcDate('2026-10-03 23:30:00')).toBe(Date.UTC(2026, 9, 3, 23, 30))
      expect(parseUtcDate(undefined)).toBeNull()
      expect(parseUtcDate('not a date')).toBeNull()
    })

    it('keeps a track added within the days, to the minute', () => {
      const late = track({ date_added: '2026-10-03 23:30:00' })
      const at = (now: number) => ids(applyTrackFilter([late], { added: 7 }, { playedIds: null, now }))
      expect(at(Date.UTC(2026, 9, 10, 23, 29))).toEqual([late.id])
      expect(at(Date.UTC(2026, 9, 10, 23, 31))).toEqual([])
    })

    it('counts 30 days', () => {
      const old = track({ date_added: '2026-09-15 12:00:00' })
      expect(ids(applyTrackFilter([old], { added: 7 }, context))).toEqual([])
      expect(ids(applyTrackFilter([old], { added: 30 }, context))).toEqual([old.id])
    })

    it('leaves out a track with no date', () => {
      expect(applyTrackFilter([track()], { added: 30 }, context)).toEqual([])
    })
  })

  describe('Played', () => {
    const played = track()
    const fresh = track()
    const withPlays: FilterContext = { playedIds: new Set([played.id]), now: NOW }

    it('Never keeps the tracks not played', () => {
      expect(ids(applyTrackFilter([played, fresh], { played: 'never' }, withPlays))).toEqual([
        fresh.id,
      ])
    })

    it('Played keeps the tracks played', () => {
      expect(ids(applyTrackFilter([played, fresh], { played: 'played' }, withPlays))).toEqual([
        played.id,
      ])
    })

    it('keeps nothing until the played tracks are read', () => {
      expect(applyTrackFilter([played, fresh], { played: 'never' }, context)).toEqual([])
    })
  })

  it('keeps a rating at or above the minimum', () => {
    const tracks = [0, 2, 3, 5].map((rating) => track({ rating }))
    expect(applyTrackFilter(tracks, { minRating: 3 }, context).map((t) => t.rating)).toEqual([
      3, 5,
    ])
  })

  it('needs every field to match', () => {
    const hit = track({ genre: 'House', bpm: 126, rating: 4 })
    const wrongBpm = track({ genre: 'House', bpm: 122, rating: 4 })
    const wrongGenre = track({ genre: 'Techno', bpm: 126, rating: 4 })
    const filter: TrackFilter = { genre: 'House', bpmMin: 125, bpmMax: 130, minRating: 3 }
    expect(ids(applyTrackFilter([hit, wrongBpm, wrongGenre], filter, context))).toEqual([hit.id])
  })
})

describe('the button label', () => {
  it('names each field', () => {
    expect(filterConditionLabels({ genre: 'Tech House' })).toEqual(['Tech House'])
    expect(filterConditionLabels({ bpmMin: 125, bpmMax: 130 })).toEqual(['125–129 BPM'])
    expect(filterConditionLabels({ bpmMin: 135 })).toEqual(['135+ BPM'])
    expect(filterConditionLabels({ bpmMax: 115 })).toEqual(['< 115 BPM'])
    expect(filterConditionLabels({ key: '6A' })).toEqual(['Key 6A'])
    expect(filterConditionLabels({ added: 7 })).toEqual(['Added 7 days'])
    expect(filterConditionLabels({ added: 30 })).toEqual(['Added 30 days'])
    expect(filterConditionLabels({ played: 'never' })).toEqual(['Never played'])
    expect(filterConditionLabels({ played: 'played' })).toEqual(['Played'])
    expect(filterConditionLabels({ minRating: 3 })).toEqual(['★3+'])
    expect(filterConditionLabels({ minRating: 5 })).toEqual(['★5'])
  })

  it('lists the fields in the panel order', () => {
    expect(
      filterConditionLabels({ minRating: 2, played: 'never', key: '8A', genre: 'House' }),
    ).toEqual(['House', 'Key 8A', 'Never played', '★2+'])
  })

  it('shows the first two', () => {
    expect(filterButtonLabel({ genre: 'Tech House', bpmMin: 125, bpmMax: 130 })).toBe(
      'Tech House · 125–129 BPM',
    )
  })

  it('counts the rest as +N', () => {
    expect(
      filterButtonLabel({ genre: 'Tech House', bpmMin: 125, bpmMax: 130, key: '6A', added: 7 }),
    ).toBe('Tech House · 125–129 BPM · +2')
  })

  it('is null with no field set', () => {
    expect(filterButtonLabel(null)).toBeNull()
    expect(filterButtonLabel({})).toBeNull()
  })
})

describe('the genre and key lists', () => {
  it('counts genres, most first, then by name', () => {
    const tracks = [
      track({ genre: 'House' }),
      track({ genre: 'Techno' }),
      track({ genre: 'House' }),
      track({ genre: 'Afro House' }),
      track(),
    ]
    expect(trackFacets(tracks, null).genres).toEqual([
      { value: 'House', count: 2 },
      { value: 'Afro House', count: 1 },
      { value: 'Techno', count: 1 },
    ])
  })

  it('orders keys as on the Camelot wheel', () => {
    const tracks = ['12B', '1B', '6A', '1A', '10A'].map((k) => track({ musical_key: k }))
    expect(trackFacets(tracks, null).keys.map((k) => k.value)).toEqual([
      '1A',
      '1B',
      '6A',
      '10A',
      '12B',
    ])
  })

  it('keeps the chosen value with no tracks, at 0', () => {
    const facets = trackFacets([track({ genre: 'House' })], { genre: 'Techno', key: '8A' })
    expect(facets.genres).toContainEqual({ value: 'Techno', count: 0 })
    expect(facets.keys).toEqual([{ value: '8A', count: 0 }])
  })
})

describe('changing one field', () => {
  it('sets it', () => {
    expect(withFilterField({ genre: 'House' }, 'minRating', 3)).toEqual({
      genre: 'House',
      minRating: 3,
    })
  })

  it('removes it, given undefined', () => {
    expect(withFilterField({ genre: 'House', minRating: 3 }, 'minRating', undefined)).toEqual({
      genre: 'House',
    })
  })

  it('answers null when nothing is left', () => {
    expect(withFilterField({ genre: 'House' }, 'genre', undefined)).toBeNull()
    expect(isEmptyFilter(null)).toBe(true)
    expect(isEmptyFilter({ genre: undefined })).toBe(true)
  })
})

describe('the BPM boxes', () => {
  it('read whole numbers', () => {
    expect(parseBpmInput('125')).toBe(125)
    expect(parseBpmInput('125.7')).toBe(125)
    expect(parseBpmInput('')).toBeUndefined()
    expect(parseBpmInput('-3')).toBeUndefined()
  })
})
