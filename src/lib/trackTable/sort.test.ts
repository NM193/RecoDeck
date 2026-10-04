// src/lib/trackTable/sort.test.ts
import { describe, expect, it } from 'vitest'
import type { Track } from '../../types/track'
import { defaultLayout, setColumnShown } from './columns'
import { DEFAULT_SORT, nextSort, sortTracks, visibleSort } from './sort'

let nextId = 1
function track(fields: Partial<Track> = {}): Track {
  const id = nextId++
  return { id, file_path: `/m/${id}.mp3`, file_hash: `h${id}`, play_count: 0, rating: 0, ...fields }
}

describe('clicking a head', () => {
  it('sorts a new column ascending, and reverses on the second click', () => {
    const byBpm = nextSort(DEFAULT_SORT, 'bpm')
    expect(byBpm).toEqual({ column: 'bpm', direction: 'asc' })
    expect(nextSort(byBpm, 'bpm')).toEqual({ column: 'bpm', direction: 'desc' })
  })

  it('starts Rating, Plays and Added with the most', () => {
    expect(nextSort(DEFAULT_SORT, 'rating').direction).toBe('desc')
    expect(nextSort(DEFAULT_SORT, 'plays').direction).toBe('desc')
    expect(nextSort(DEFAULT_SORT, 'added').direction).toBe('desc')
  })
})

describe('the sort shown', () => {
  it('keeps a sort by a shown column, by title or by artist', () => {
    const layout = defaultLayout()
    expect(visibleSort({ column: 'bpm', direction: 'desc' }, layout).column).toBe('bpm')
    expect(visibleSort({ column: 'artist', direction: 'asc' }, layout).column).toBe('artist')
  })

  it('falls back to title once the sorted column is hidden', () => {
    const layout = setColumnShown(defaultLayout(), 'bpm', false)
    expect(visibleSort({ column: 'bpm', direction: 'desc' }, layout)).toEqual(DEFAULT_SORT)
  })
})

describe('sorting', () => {
  it('keeps empty values last in either direction', () => {
    const tracks = [track({ label: 'B' }), track(), track({ label: 'a' })]
    const labels = (direction: 'asc' | 'desc') =>
      sortTracks(tracks, { column: 'label', direction }, null).map((t) => t.label)
    expect(labels('asc')).toEqual(['a', 'B', undefined])
    expect(labels('desc')).toEqual(['B', 'a', undefined])
  })

  it('sorts by plays, unplayed last', () => {
    const a = track()
    const b = track()
    const c = track()
    const plays = new Map([
      [a.id, 2],
      [c.id, 5],
    ])
    expect(sortTracks([a, b, c], { column: 'plays', direction: 'desc' }, plays)).toEqual([c, a, b])
  })

  it('sorts by the date added', () => {
    const old = track({ date_added: '2025-01-02 10:00:00' })
    const fresh = track({ date_added: '2026-10-03 09:00:00' })
    expect(sortTracks([old, fresh], { column: 'added', direction: 'desc' }, null)).toEqual([
      fresh,
      old,
    ])
  })

  it('leaves the given list as it was', () => {
    const tracks = [track({ title: 'b' }), track({ title: 'a' })]
    const copy = [...tracks]
    sortTracks(tracks, DEFAULT_SORT, null)
    expect(tracks).toEqual(copy)
  })
})
