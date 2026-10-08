// src/lib/sets/setPage.ts
// The words and numbers on a set's page (Sets redesign spec, The set page):
// the hero's numbers and source line, the filter's counts and rows, and the
// missing tracks to copy. Parsing and matching are untouched; this only reads
// what they produced.
import type { MatchSummary } from '../tracklist/match'
import type { Track, TracklistResult } from '../tracklist'

/** The rows the filter shows: all, the ones you own, the ones you miss, the IDs. */
export type SetFilter = 'all' | 'have' | 'missing' | 'ids'

export interface HeroNumber {
  key: string
  value: number
  label: string
  /** You own: green. */
  owned?: boolean
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many)

/**
 * "41 tracks · 3 lists · 3 you own · 37 missing · 1 ID": the parts with
 * nothing in them are left out. Owned and missing wait for the match.
 */
export function heroNumbers(result: TracklistResult, matches: MatchSummary | null): HeroNumber[] {
  const ids = result.tracks.filter((t) => t.isUnknown).length
  const parts: HeroNumber[] = [
    { key: 'tracks', value: result.tracks.length, label: plural(result.tracks.length, 'track') },
    { key: 'lists', value: result.sourceCount, label: plural(result.sourceCount, 'list') },
    { key: 'owned', value: matches?.owned ?? 0, label: 'you own', owned: true },
    { key: 'missing', value: matches?.missing ?? 0, label: 'missing' },
    { key: 'ids', value: ids, label: plural(ids, 'ID') },
  ]
  return parts.filter((part) => part.value > 0)
}

/** Today's status label, when the list is not a plain one ("assembled from comments", "low confidence"). */
export function statusNote(result: TracklistResult): string | null {
  switch (result.status) {
    case 'assembled':
      return 'assembled from comments'
    case 'low_confidence':
      return 'low confidence'
    default:
      return null
  }
}

/**
 * The muted line under the numbers: "from 3 crossed lists · strongest
 * source: the description" (or "comment by …"), and the status label when
 * there is one. Empty for a set with no tracklist.
 */
export function sourceLine(result: TracklistResult): string {
  if (result.tracks.length === 0) return ''
  const parts: string[] = []
  // Assembled from scattered comments, there are no lists to count.
  if (result.sourceCount > 1) parts.push(`from ${result.sourceCount} crossed lists`)
  else if (result.sourceCount === 1) parts.push('from 1 list')
  if (result.source === 'description') parts.push('strongest source: the description')
  else if (result.source === 'comment') {
    parts.push(`strongest source: comment${result.sourceMeta ? ` by ${result.sourceMeta.author}` : ''}`)
  }
  const note = statusNote(result)
  if (note) parts.push(note)
  return parts.join(' · ')
}

/** How many rows each filter shows. An ID is neither owned nor missing. */
export function filterCounts(tracks: readonly Track[], matches: MatchSummary | null): Record<SetFilter, number> {
  const counts = { all: tracks.length, have: 0, missing: 0, ids: 0 }
  for (const track of tracks) {
    if (track.isUnknown) counts.ids += 1
    else if (matches?.byIndex.has(track.index)) counts.have += 1
    else counts.missing += 1
  }
  return counts
}

/** The rows a filter shows, in the set's order. */
export function filterRows(tracks: readonly Track[], matches: MatchSummary | null, filter: SetFilter): Track[] {
  return tracks.filter((track) => {
    if (filter === 'all') return true
    if (filter === 'ids') return track.isUnknown
    if (track.isUnknown) return false
    const owned = matches?.byIndex.has(track.index) ?? false
    return filter === 'have' ? owned : !owned
  })
}

/** "Artist - Title (Mix)": a track as the missing list copies it. */
export function trackLine(track: Pick<Track, 'artist' | 'title' | 'mix'>): string {
  const name = track.artist ? `${track.artist} - ${track.title}` : track.title
  return track.mix ? `${name} (${track.mix})` : name
}

/** The missing tracks, one per line, for ⋯ › Copy missing tracks. */
export function missingTracks(tracks: readonly Track[], matches: MatchSummary | null): string[] {
  return filterRows(tracks, matches, 'missing').map(trackLine)
}

/** A YouTube thumbnail of the video: `hqdefault` for the hero, `mqdefault` for cards. */
export function thumbnailUrl(videoId: string, size: 'hqdefault' | 'mqdefault' = 'hqdefault'): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${size}.jpg`
}

/** "saved Sep 27" (with the year when it is not this one), from SQLite's UTC text. */
export function savedLabel(addedAt: string | null | undefined, now = new Date()): string | null {
  const match = addedAt ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(addedAt) : null
  if (!match) return null
  const [, y, mo, d, h, mi] = match
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)))
  const day = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
  return `saved ${day}`
}
