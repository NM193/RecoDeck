// src/lib/home/labels.ts
// The words and numbers on Home's cards (Home cards spec, Cards in detail).
import { ALL_LISTS } from '../../types/spotify'
import { parseUtcDate, type TrackFilter } from '../trackTable/filter'
import type { BpmRangeCount, NewDjFind, NewDjFinds, UpcomingGig } from '../../types/home'

const DAY_MS = 24 * 60 * 60 * 1000

/** A track row's BPM in whole beats ("125"), or "—". */
export function bpmLabel(bpm: number | null | undefined): string {
  return bpm ? String(Math.round(bpm)) : '—'
}

/** "1,581". */
export function count(value: number): string {
  return value.toLocaleString('en-US')
}

function parseDay(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

const dayOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Local calendar days from `then` to `now`, 0 on the same day. Rounded: a day across a clock change is 23 or 25 hours. */
const daysBetween = (then: Date, now: Date) => Math.round((dayOf(now) - dayOf(then)) / DAY_MS)

/** "Oct 2", with the year when it is not `now`'s. */
function shortDate(date: Date, now: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/**
 * When a track was played (`played_at`, unix seconds, UTC): "22:39" on the
 * local day of `now`, "yesterday", else "Oct 2".
 */
export function playedLabel(playedAt: number, now: Date): string {
  const then = new Date(playedAt * 1000)
  const days = daysBetween(then, now)
  if (days <= 0) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(then.getHours())}:${pad(then.getMinutes())}`
  }
  if (days === 1) return 'yesterday'
  return shortDate(then, now)
}

/**
 * When a track was added (`date_added`, SQLite's UTC "2026-10-03 21:14:05"),
 * as `playedLabel` says when it was played; "—" when it cannot be read.
 */
export function addedLabel(dateAdded: string | undefined, now: Date): string {
  const time = parseUtcDate(dateAdded)
  return time === null ? '—' : playedLabel(time / 1000, now)
}

/** Last playlist's line: "10 tracks · played Oct 2", "played at 22:39" today, "played yesterday". */
export function lastPlaylistLine(tracks: number, playedAt: number, now: Date): string {
  const then = new Date(playedAt * 1000)
  const days = daysBetween(then, now)
  const played =
    days <= 0
      ? `played at ${playedLabel(playedAt, now)}`
      : days === 1
        ? 'played yesterday'
        : `played ${shortDate(then, now)}`
  return `${count(tracks)} ${noun(tracks, 'track')} · ${played}`
}

/** Under a card that draws only its first rows: "and 1,900 more"; null when it draws them all. */
export function moreRowsLine(total: number, shown: number): string | null {
  return total > shown ? `and ${count(total - shown)} more` : null
}

/** A service's new likes not owned, as the sidebar counts them. */
export interface StreamNews {
  total: number
  byList: ReadonlyMap<string, number>
  lists: ReadonlyArray<{ id: string; name: string; position: number }>
}

/** The list with the most new likes (the sidebar's first on a tie); null when none has any. */
export function busiestList(news: StreamNews): { id: string; name: string } | null {
  let best: { id: string; name: string; position: number; count: number } | null = null
  for (const list of news.lists) {
    const n = news.byList.get(list.id) ?? 0
    if (n === 0) continue
    if (!best || n > best.count || (n === best.count && list.position < best.position)) {
      best = { ...list, count: n }
    }
  }
  return best && { id: best.id, name: best.name }
}

export interface NewLikeRow {
  service: 'spotify' | 'youtube-music'
  listId: string
  name: string
  number: string
}

/**
 * New likes you don't own: a row per list with new likes, Spotify's then
 * YouTube Music's, each in the sidebar's order. A service is null when it is
 * not shown in the sidebar.
 */
export function newLikeRows(spotify: StreamNews | null, youtubeMusic: StreamNews | null): NewLikeRow[] {
  const rows = (service: NewLikeRow['service'], news: StreamNews | null): NewLikeRow[] =>
    (news?.lists ?? []).flatMap((list) => {
      const n = news?.byList.get(list.id) ?? 0
      return n > 0 ? [{ service, listId: list.id, name: list.name, number: count(n) }] : []
    })
  return [...rows('spotify', spotify), ...rows('youtube-music', youtubeMusic)]
}

export type NeedsYouRow =
  | { kind: 'spotify' | 'youtube-music'; number: string; text: string; place: string; listId: string }
  | { kind: 'new-sets' | 'not-analyzed'; number: string; text: string; place: string }
  | { kind: 'next-gig'; number: string; text: string; place: string; djName: string }

function streamRow(kind: 'spotify' | 'youtube-music', news: StreamNews | null): NeedsYouRow[] {
  if (!news || news.total === 0) return []
  const one = news.total === 1
  const text =
    kind === 'spotify'
      ? `New Spotify ${one ? 'like' : 'likes'} you don't own`
      : `New YouTube Music ${one ? 'like' : 'likes'}`
  const list = busiestList(news)
  return [{ kind, number: count(news.total), text, place: list?.name ?? 'All', listId: list?.id ?? ALL_LISTS }]
}

/**
 * "New sets", or "New sets by Hot Since 82" when every one was read and
 * they are all one DJ's.
 */
function newSetsText(news: NewDjFinds): string {
  const sets = news.total === 1 ? 'New set' : 'New sets'
  const djs = new Set(news.finds.map((find) => find.displayName))
  return news.finds.length === news.total && djs.size === 1 ? `${sets} by ${[...djs][0]}` : sets
}

/**
 * Needs you's rows, in the spec's order; a row whose number is 0 is left
 * out. `spotify` / `youtubeMusic` are null when the service is not shown in
 * the sidebar; `nextGig` is the earliest upcoming gig of the DJs with a page.
 */
export function needsYouRows(facts: {
  spotify: StreamNews | null
  youtubeMusic: StreamNews | null
  newSets: NewDjFinds
  notAnalyzed: number
  nextGig: UpcomingGig | null
  today: string
}): NeedsYouRow[] {
  const rows: NeedsYouRow[] = [
    ...streamRow('spotify', facts.spotify),
    ...streamRow('youtube-music', facts.youtubeMusic),
  ]
  if (facts.newSets.total > 0) {
    rows.push({
      kind: 'new-sets',
      number: count(facts.newSets.total),
      text: newSetsText(facts.newSets),
      place: 'Sets',
    })
  }
  if (facts.notAnalyzed > 0) {
    rows.push({
      kind: 'not-analyzed',
      number: count(facts.notAnalyzed),
      text: facts.notAnalyzed === 1 ? 'Track not analyzed' : 'Tracks not analyzed',
      place: 'Analyze all',
    })
  }
  const gig = facts.nextGig
  const day = gig && parseDay(gig.date)
  if (gig && day) {
    const where = gig.venue ?? gig.city
    rows.push({
      kind: 'next-gig',
      number: day.toLocaleDateString('en-US', { weekday: 'short' }),
      text: where ? `${gig.displayName} plays ${where}` : `${gig.displayName} has a gig`,
      place: shortDate(day, parseDay(facts.today) ?? new Date()),
      djName: gig.displayName,
    })
  }
  return rows
}

/** A new set's line: "Hot Since 82 · Cercle"; the channel once when it is the DJ's own. */
export function newSetLine(find: Pick<NewDjFind, 'displayName' | 'channel'>): string {
  const channel = find.channel?.trim()
  if (!channel || channel.toLowerCase() === find.displayName.toLowerCase()) return find.displayName
  return `${find.displayName} · ${channel}`
}

/** What opening a new set costs: "saved" (in the library), else "5–7 units" (fetched). */
export function newSetCost(find: Pick<NewDjFind, 'saved'>): string {
  return find.saved ? 'saved' : '5–7 units'
}

/** A gig's date block: "06" over "OCT"; null for a date it cannot read. */
export function gigDay(date: string): { day: string; month: string } | null {
  const day = parseDay(date)
  if (!day) return null
  return {
    day: String(day.getDate()).padStart(2, '0'),
    month: day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  }
}

/** "Ibiza, ES": a gig row's place; either part may be missing. */
export function gigWhere(gig: Pick<UpcomingGig, 'city' | 'country'>): string {
  return [gig.city, gig.country].filter(Boolean).join(', ')
}

/** "Traumer · Hï Ibiza": a gig row's line. */
export function gigLine(gig: Pick<UpcomingGig, 'displayName' | 'venue'>): string {
  return gig.venue ? `${gig.displayName} · ${gig.venue}` : gig.displayName
}

export interface LibraryCounts {
  tracks: number
  playlists: number
  folders: number
  /** null until the library's groups are read. */
  addedLately: number | null
  neverPlayed: number | null
}

const noun = (value: number, one: string) => `${one}${value === 1 ? '' : 's'}`

/**
 * Library stats at a card width: at 1 column the track count and "N added
 * lately"; at 2 and wider tracks, playlists and folders, with "N added lately
 * · N never played" under them.
 */
export function libraryStats(
  columns: number,
  counts: LibraryCounts,
): { figures: Array<{ value: string; label: string }>; line: string } {
  const figure = (value: number, one: string) => ({ value: count(value), label: noun(value, one) })
  const added = counts.addedLately === null ? [] : [`${count(counts.addedLately)} added lately`]
  if (columns < 2) return { figures: [figure(counts.tracks, 'track')], line: added.join('') }
  const never = counts.neverPlayed === null ? [] : [`${count(counts.neverPlayed)} never played`]
  return {
    figures: [
      figure(counts.tracks, 'track'),
      figure(counts.playlists, 'playlist'),
      figure(counts.folders, 'folder'),
    ],
    line: [...added, ...never].join(' · '),
  }
}

export interface BpmBar {
  key: string
  /** "< 115", "115–119", "135+". */
  label: string
  count: number
  /** All Tracks with this filter shows the bar's tracks. */
  filter: TrackFilter
}

/** BPM & key's bars, one per range, each with the All Tracks filter whose rows it counts. */
export function bpmBars(ranges: readonly BpmRangeCount[]): BpmBar[] {
  return ranges.map(({ min, max, count: tracks }) => {
    const filter: TrackFilter = {}
    if (min !== null) filter.bpmMin = min
    if (max !== null) filter.bpmMax = max
    const label =
      min !== null && max !== null
        ? `${min}–${max - 1}`
        : min !== null
          ? `${min}+`
          : max !== null
            ? `< ${max}`
            : 'Any BPM'
    return { key: `${min ?? ''}-${max ?? ''}`, label, count: tracks, filter }
  })
}

/** Under the key counts: "key known for 97 tracks". */
export function keyKnownLine(keys: ReadonlyArray<{ count: number }>): string {
  const known = keys.reduce((sum, key) => sum + key.count, 0)
  return `key known for ${count(known)} ${noun(known, 'track')}`
}
