// src/lib/trackTable/filter.ts
// The track table's filter (track table spec): which fields narrow the view,
// whether a track matches, the button's label and the panel's genre and key
// lists. The Search and Home plans open All Tracks with one field set.
import type { Track } from '../../types/track'

export interface TrackFilter {
  genre?: string
  /** Inclusive. */
  bpmMin?: number
  /** Exclusive; absent = no upper bound. The panel's "to" shows bpmMax − 1. */
  bpmMax?: number
  key?: string
  /** Days. */
  added?: 7 | 30
  played?: 'never' | 'played'
  /** 1–5. */
  minRating?: number
}

export interface FilterContext {
  /** Every track played at least once; null until read. */
  playedIds: ReadonlySet<number> | null
  /** Milliseconds since the epoch; Added counts back from it. */
  now?: number
}

export interface FacetOption {
  value: string
  count: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** True for null and for a filter with no field set. */
export function isEmptyFilter(filter: TrackFilter | null | undefined): boolean {
  return !filter || Object.values(filter).every((value) => value === undefined)
}

/** `filter` with one field set, or removed when `value` is undefined; null when nothing is left. */
export function withFilterField<K extends keyof TrackFilter>(
  filter: TrackFilter | null,
  field: K,
  value: TrackFilter[K] | undefined,
): TrackFilter | null {
  const next: TrackFilter = { ...filter }
  if (value === undefined) delete next[field]
  else next[field] = value
  return isEmptyFilter(next) ? null : next
}

/**
 * The tracks table's `date_added` ("2026-10-03 21:14:05", SQLite's
 * datetime('now')) is UTC with no zone; read it as UTC.
 */
export function parseUtcDate(value: string | undefined): number | null {
  if (!value) return null
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : time
}

export function matchesTrackFilter(
  track: Track,
  filter: TrackFilter,
  context: FilterContext,
): boolean {
  if (filter.genre !== undefined && track.genre !== filter.genre) return false
  if (filter.bpmMin !== undefined || filter.bpmMax !== undefined) {
    if (!track.bpm) return false
    if (filter.bpmMin !== undefined && track.bpm < filter.bpmMin) return false
    if (filter.bpmMax !== undefined && track.bpm >= filter.bpmMax) return false
  }
  if (filter.key !== undefined && track.musical_key !== filter.key) return false
  if (filter.added !== undefined) {
    const added = parseUtcDate(track.date_added)
    const now = context.now ?? Date.now()
    if (added === null || now - added > filter.added * DAY_MS) return false
  }
  if (filter.played !== undefined) {
    if (!context.playedIds) return false
    const played = context.playedIds.has(track.id)
    if (filter.played === 'never' ? played : !played) return false
  }
  if (filter.minRating !== undefined && (track.rating ?? 0) < filter.minRating) {
    return false
  }
  return true
}

/** The tracks the filter keeps, in their order; all of them with no filter. */
export function applyTrackFilter(
  tracks: Track[],
  filter: TrackFilter | null,
  context: FilterContext,
): Track[] {
  if (!filter || isEmptyFilter(filter)) return tracks
  const now = context.now ?? Date.now()
  return tracks.filter((track) =>
    matchesTrackFilter(track, filter, { ...context, now }),
  )
}

/** "★3+"; the top rating alone is "★5". */
export function ratingLabel(minRating: number): string {
  return minRating >= 5 ? '★5' : `★${minRating}+`
}

/** One label per field set, in the panel's order. */
export function filterConditionLabels(filter: TrackFilter): string[] {
  const labels: string[] = []
  if (filter.genre !== undefined) labels.push(filter.genre)
  if (filter.bpmMin !== undefined && filter.bpmMax !== undefined) {
    labels.push(`${filter.bpmMin}–${filter.bpmMax - 1} BPM`)
  } else if (filter.bpmMin !== undefined) {
    labels.push(`${filter.bpmMin}+ BPM`)
  } else if (filter.bpmMax !== undefined) {
    labels.push(`< ${filter.bpmMax} BPM`)
  }
  if (filter.key !== undefined) labels.push(`Key ${filter.key}`)
  if (filter.added !== undefined) labels.push(`Added ${filter.added} days`)
  if (filter.played !== undefined) {
    labels.push(filter.played === 'never' ? 'Never played' : 'Played')
  }
  if (filter.minRating !== undefined) labels.push(ratingLabel(filter.minRating))
  return labels
}

/** "Tech House · 125–129 BPM · +2"; null with no field set. */
export function filterButtonLabel(filter: TrackFilter | null): string | null {
  if (!filter) return null
  const labels = filterConditionLabels(filter)
  if (labels.length === 0) return null
  const shown = labels.slice(0, 2)
  if (labels.length > 2) shown.push(`+${labels.length - 2}`)
  return shown.join(' · ')
}

/** A BPM box's text as a whole number; undefined when empty or not a number. */
export function parseBpmInput(text: string): number | undefined {
  const value = Number.parseInt(text, 10)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

// Camelot keys ("8A") by number, A before B; anything else after, by name.
function compareKeys(a: string, b: string): number {
  const pa = /^(\d{1,2})([AB])$/i.exec(a)
  const pb = /^(\d{1,2})([AB])$/i.exec(b)
  if (pa && pb) {
    return (
      Number(pa[1]) - Number(pb[1]) ||
      pa[2].toUpperCase().localeCompare(pb[2].toUpperCase())
    )
  }
  if (pa) return -1
  if (pb) return 1
  return a.localeCompare(b)
}

function toOptions(counts: Map<string, number>): FacetOption[] {
  return [...counts].map(([value, count]) => ({ value, count }))
}

/**
 * The genres (most tracks first) and keys (Camelot order) among the view's
 * tracks before the filter. The value chosen stays in its list even where no
 * track has it.
 */
export function trackFacets(
  tracks: Track[],
  filter: TrackFilter | null,
): { genres: FacetOption[]; keys: FacetOption[] } {
  const genres = new Map<string, number>()
  const keys = new Map<string, number>()
  for (const track of tracks) {
    if (track.genre) genres.set(track.genre, (genres.get(track.genre) ?? 0) + 1)
    if (track.musical_key) {
      keys.set(track.musical_key, (keys.get(track.musical_key) ?? 0) + 1)
    }
  }
  if (filter?.genre !== undefined && !genres.has(filter.genre)) {
    genres.set(filter.genre, 0)
  }
  if (filter?.key !== undefined && !keys.has(filter.key)) keys.set(filter.key, 0)
  return {
    genres: toOptions(genres).sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value),
    ),
    keys: toOptions(keys).sort((a, b) => compareKeys(a.value, b.value)),
  }
}
