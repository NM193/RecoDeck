// src/lib/spotify/rows.ts
/**
 * What the Spotify view shows for one list: one row per track, newest added
 * first. In All playlists a track in several lists is one row, dated by its
 * newest add, with every list it is in.
 */
import { isNew } from './newness'
import type { Ownership, OwnershipKind } from './ownership'
import { ALL_LISTS, type SpotifyLibrary, type SpotifyTrack } from '../../types/spotify'

export interface SpotifyRow {
  track: SpotifyTrack
  ownership: Ownership
  /** Newest Spotify added_at across the lists shown (ISO), or null. */
  addedAt: string | null
  /** Names of the lists it is in, in sidebar order. */
  lists: string[]
  /** New since the list was opened, and not owned: the indigo dot. */
  isNew: boolean
}

export type StatusFilter = 'all' | OwnershipKind

/**
 * @param seenBefore each list's lastOpenedAt as it was when the view was
 *   opened. Opening writes a new lastOpenedAt at once, and comparing with that
 *   would clear the dots before they were seen.
 */
export function rowsFor(
  listId: string,
  library: SpotifyLibrary,
  ownership: Map<string, Ownership>,
  seenBefore: Map<string, number>,
): SpotifyRow[] {
  const lists = new Map(library.lists.map((list) => [list.id, list]))
  const tracks = new Map(library.tracks.map((track) => [track.spotifyId, track]))
  const byTrack = new Map<string, { addedAt: string | null; listIds: Set<string>; isNew: boolean }>()

  for (const entry of library.entries) {
    if (listId !== ALL_LISTS && entry.listId !== listId) continue
    const list = lists.get(entry.listId)
    if (!list) continue

    const row = byTrack.get(entry.spotifyId) ?? { addedAt: null, listIds: new Set<string>(), isNew: false }
    if (entry.addedAt && (!row.addedAt || entry.addedAt > row.addedAt)) row.addedAt = entry.addedAt
    row.listIds.add(entry.listId)
    row.isNew ||= isNew(entry, seenBefore.get(entry.listId) ?? list.lastOpenedAt)
    byTrack.set(entry.spotifyId, row)
  }

  const rows: SpotifyRow[] = []
  for (const [spotifyId, row] of byTrack) {
    const track = tracks.get(spotifyId)
    if (!track) continue
    const owns = ownership.get(spotifyId) ?? { kind: 'missing' }
    rows.push({
      track,
      ownership: owns,
      addedAt: row.addedAt,
      lists: [...row.listIds]
        .map((id) => lists.get(id)!)
        .sort((a, b) => a.position - b.position)
        .map((list) => list.name),
      isNew: row.isNew && owns.kind !== 'owned',
    })
  }

  // Newest first; ISO strings in one format sort as text. Undated rows last.
  return rows.sort((a, b) => {
    if (a.addedAt !== b.addedAt) {
      if (!a.addedAt) return 1
      if (!b.addedAt) return -1
      return a.addedAt < b.addedAt ? 1 : -1
    }
    return a.track.title.localeCompare(b.track.title)
  })
}

export function countByStatus(rows: SpotifyRow[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { all: rows.length, owned: 0, missing: 0, maybe: 0 }
  for (const row of rows) counts[row.ownership.kind] += 1
  return counts
}

/** Lower case without accents, so "makez" finds "Makèz" and "Makèz" finds "Makez". */
function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Status first, then every typed word must appear in title, artists or album. */
export function filterRows(rows: SpotifyRow[], filter: StatusFilter, query: string): SpotifyRow[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (filter !== 'all' && row.ownership.kind !== filter) return false
    if (!words.length) return true
    const haystack = fold(`${row.track.title} ${row.track.artists} ${row.track.album ?? ''}`)
    return words.every((word) => haystack.includes(word))
  })
}

/** Rows behind each sidebar item: per list, and every track for All playlists. */
export function listCounts(library: SpotifyLibrary): Map<string, number> {
  const counts = new Map<string, number>([[ALL_LISTS, library.tracks.length]])
  for (const entry of library.entries) counts.set(entry.listId, (counts.get(entry.listId) ?? 0) + 1)
  return counts
}

const DAY_MS = 86_400_000

/** "today", "yesterday", "Sep 28", or "Sep 28, 2024" — by local calendar day. */
export function formatAdded(iso: string | null, now: Date): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  // Rounded, so a 23- or 25-hour day around a clock change is still one day.
  const days = Math.round((day(now) - day(date)) / DAY_MS)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return date.toLocaleDateString(
    'en-US',
    date.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  )
}

/** "just now", "2 min ago", "2 h ago", "3 d ago". A time in the future is "just now". */
export function formatSynced(ms: number, now: number): string {
  const elapsed = Math.max(0, now - ms)
  if (elapsed < 60_000) return 'just now'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / 3_600_000)} h ago`
  return `${Math.floor(elapsed / DAY_MS)} d ago`
}

/** The last part of a path, for "In library: <file name>". */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
