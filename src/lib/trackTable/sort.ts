// src/lib/trackTable/sort.ts
// Sorting the track table: a head click sorts by its column, again reverses.
// Rating, Plays and Added start with the most; empty values stay last either
// way. A list with an order of its own (a playlist) opens in that order — no
// sort, null — and a third click on the same head goes back to it.
import type { Track } from '../../types/track'
import { shownColumns, type ColumnId, type TrackTableLayout } from './columns'

export type SortColumn =
  | 'title'
  | 'artist'
  | 'album'
  | 'bpm'
  | 'key'
  | 'genre'
  | 'duration'
  | 'format'
  | 'rating'
  | 'comment'
  | 'label'
  | 'added'
  | 'plays'

export interface SortState {
  column: SortColumn
  direction: 'asc' | 'desc'
}

export const DEFAULT_SORT: SortState = { column: 'title', direction: 'asc' }

/** What each column's head sorts by; Title & artist's "Artist" sorts by artist. */
export const SORT_BY_COLUMN: Record<ColumnId, SortColumn> = {
  title: 'title',
  bpm: 'bpm',
  key: 'key',
  genre: 'genre',
  label: 'label',
  time: 'duration',
  added: 'added',
  album: 'album',
  rating: 'rating',
  comment: 'comment',
  plays: 'plays',
  format: 'format',
}

const MOST_FIRST = new Set<SortColumn>(['rating', 'plays', 'added'])

/**
 * The sort after a click on `column`'s head (null: the list's own order). With
 * `ownOrder`, the click after the reversing one goes back to that order.
 */
export function nextSort(
  previous: SortState | null,
  column: SortColumn,
  ownOrder = false,
): SortState | null {
  const first = MOST_FIRST.has(column) ? 'desc' : 'asc'
  if (previous?.column === column) {
    if (ownOrder && previous.direction !== first) return null
    return { column, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { column, direction: first }
}

/**
 * The sort shown: `fallback` (by title, or a playlist's own order) when the
 * sorted column was hidden since.
 */
export function visibleSort(
  sort: SortState | null,
  layout: TrackTableLayout,
  fallback: SortState | null = DEFAULT_SORT,
): SortState | null {
  if (sort === null || sort.column === 'title' || sort.column === 'artist') return sort
  const shown = shownColumns(layout).some((column) => SORT_BY_COLUMN[column.id] === sort.column)
  return shown ? sort : fallback
}

function sortValue(
  track: Track,
  column: SortColumn,
  plays: ReadonlyMap<number, number> | null,
): string | number {
  switch (column) {
    case 'title':
      return track.title?.toLowerCase() ?? ''
    case 'artist':
      return track.artist?.toLowerCase() ?? ''
    case 'album':
      return track.album?.toLowerCase() ?? ''
    case 'bpm':
      return track.bpm ?? 0
    case 'key':
      return (track.musical_key ?? '').toLowerCase()
    case 'genre':
      return (track.genre ?? '').toLowerCase()
    case 'duration':
      return track.duration_ms ?? 0
    case 'format':
      return track.file_format?.toLowerCase() ?? ''
    case 'rating':
      return track.rating ?? 0
    case 'comment':
      return (track.comment ?? '').toLowerCase()
    case 'label':
      return (track.label ?? '').toLowerCase()
    case 'added':
      // "YYYY-MM-DD HH:MM:SS" sorts as text.
      return track.date_added ?? ''
    case 'plays':
      return plays?.get(track.id) ?? 0
  }
}

/** A sorted copy (no sort: the list as it is); `plays` is needed only to sort by Plays. */
export function sortTracks(
  tracks: Track[],
  sort: SortState | null,
  plays: ReadonlyMap<number, number> | null,
): Track[] {
  if (sort === null) return tracks
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...tracks].sort((a, b) => {
    const valueA = sortValue(a, sort.column, plays)
    const valueB = sortValue(b, sort.column, plays)
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      // Empty strings stay at the bottom whichever the direction.
      if (valueA === '' && valueB !== '') return 1
      if (valueA !== '' && valueB === '') return -1
      return valueA.localeCompare(valueB) * direction
    }
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      // 0 (empty) stays at the bottom whichever the direction.
      if (valueA === 0 && valueB !== 0) return 1
      if (valueA !== 0 && valueB === 0) return -1
      return (valueA - valueB) * direction
    }
    return 0
  })
}
