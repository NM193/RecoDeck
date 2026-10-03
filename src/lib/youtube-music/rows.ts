// src/lib/youtube-music/rows.ts
/**
 * What the YouTube Music view shows for one list: tracks newest added first,
 * and — apart from them — the DJ sets. In All playlists a video in several
 * lists is one row, dated by its newest add, with every list it is in.
 *
 * Anything longer than 20 minutes is a set, not a track: it stays out of the
 * table, the filters, the counts, matching and "new", and is listed under Sets.
 */
import { isNew } from '../spotify/newness'
import {
  classifyItems,
  type Ownership,
  type OwnershipIndex,
} from '../spotify/ownership'
import { channelArtist, parseYouTubeTitle, toParsed } from './title'
import {
  ALL_YTM_LISTS,
  type YtmErrorKind,
  type YtmLibrary,
  type YtmTrack,
  type YtmVerdict,
} from '../../types/youtubeMusic'

/** Longer than this is a set. */
export const SET_MIN_MS = 20 * 60_000

export function isSet(track: YtmTrack): boolean {
  return (track.durationMs ?? 0) > SET_MIN_MS
}

export interface YtmRow {
  track: YtmTrack
  /** Read from the YouTube title: "Tarde (Monthy Nolan Edit)". */
  title: string
  /** The parsed artist, or the channel without " - Topic". */
  artist: string
  ownership: Ownership
  /** Newest addedAt across the lists shown (ISO), or null. */
  addedAt: string | null
  /** Names of the lists it is in, in sidebar order. */
  lists: string[]
  /** New since the list was opened, and not owned: the indigo dot. */
  isNew: boolean
}

/** A set under the table: title, channel, length, Open in Sets. */
export interface YtmSetRow {
  track: YtmTrack
  addedAt: string | null
}

export interface YtmRows {
  rows: YtmRow[]
  sets: YtmSetRow[]
}

interface Dated {
  addedAt: string | null
  track: YtmTrack
}

/** Newest first; ISO strings in one format sort as text. Undated rows last. */
function newestFirst(a: Dated, b: Dated): number {
  if (a.addedAt !== b.addedAt) {
    if (!a.addedAt) return 1
    if (!b.addedAt) return -1
    return a.addedAt < b.addedAt ? 1 : -1
  }
  return a.track.title.localeCompare(b.track.title)
}

/**
 * @param seenBefore each list's lastOpenedAt as it was when the view was
 *   opened, as for Spotify: the dots are seen once.
 */
export function rowsFor(
  listId: string,
  library: YtmLibrary,
  ownership: Map<string, Ownership>,
  seenBefore: Map<string, number>,
): YtmRows {
  const lists = new Map(library.lists.map((list) => [list.id, list]))
  const tracks = new Map(library.tracks.map((track) => [track.videoId, track]))
  const byVideo = new Map<
    string,
    { addedAt: string | null; listIds: Set<string>; isNew: boolean }
  >()

  for (const entry of library.entries) {
    if (listId !== ALL_YTM_LISTS && entry.listId !== listId) continue
    const list = lists.get(entry.listId)
    if (!list) continue
    const row = byVideo.get(entry.videoId) ?? {
      addedAt: null,
      listIds: new Set<string>(),
      isNew: false,
    }
    if (entry.addedAt && (!row.addedAt || entry.addedAt > row.addedAt))
      row.addedAt = entry.addedAt
    row.listIds.add(entry.listId)
    row.isNew ||= isNew(entry, seenBefore.get(entry.listId) ?? list.lastOpenedAt)
    byVideo.set(entry.videoId, row)
  }

  const rows: YtmRow[] = []
  const sets: YtmSetRow[] = []
  for (const [videoId, row] of byVideo) {
    const track = tracks.get(videoId)
    if (!track) continue
    if (isSet(track)) {
      sets.push({ track, addedAt: row.addedAt })
      continue
    }
    const owns = ownership.get(videoId) ?? { kind: 'missing' }
    const parsed = parseYouTubeTitle(track.title, track.channel)
    rows.push({
      track,
      title: parsed.mix ? `${parsed.title} (${parsed.mix})` : parsed.title,
      artist: parsed.artist ?? channelArtist(track.channel),
      ownership: owns,
      addedAt: row.addedAt,
      lists: [...row.listIds]
        .map((id) => lists.get(id)!)
        .sort((a, b) => a.position - b.position)
        .map((list) => list.name),
      isNew: row.isNew && owns.kind !== 'owned',
    })
  }

  return { rows: rows.sort(newestFirst), sets: sets.sort(newestFirst) }
}

/**
 * Deleted and private videos in the lists shown: YouTube counts them in
 * totalResults, RecoDeck skips them. All playlists sums the lists.
 */
export function unavailableCount(listId: string, library: YtmLibrary): number {
  let count = 0
  for (const list of library.lists) {
    if (listId !== ALL_YTM_LISTS && list.id !== listId) continue
    if (list.totalResults !== null)
      count += Math.max(0, list.totalResults - list.trackCount)
  }
  return count
}

/** Tracks behind each sidebar item, sets left out; and every track for All playlists. */
export function listCounts(library: YtmLibrary): Map<string, number> {
  const sets = new Set(
    library.tracks.filter(isSet).map((track) => track.videoId),
  )
  const counts = new Map<string, number>([
    [ALL_YTM_LISTS, library.tracks.length - sets.size],
  ])
  for (const entry of library.entries) {
    if (sets.has(entry.videoId)) continue
    counts.set(entry.listId, (counts.get(entry.listId) ?? 0) + 1)
  }
  return counts
}

/**
 * Owned / Maybe / Missing for every track, sets left out. A title that names
 * no artist may still be a Maybe on its title alone.
 */
export function classifyYouTubeMusic(
  tracks: YtmTrack[],
  index: OwnershipIndex,
  verdicts: YtmVerdict[],
): Map<string, Ownership> {
  return classifyItems(
    tracks
      .filter((track) => !isSet(track))
      .map((track) => ({
        id: track.videoId,
        parsed: toParsed(track),
        titleOnly: true,
      })),
    index,
    verdicts.map((v) => ({
      id: v.videoId,
      libraryTrackId: v.libraryTrackId,
      verdict: v.verdict,
    })),
  )
}

/** The view's short word on a failed sync. The full message is in Settings. */
export function syncErrorText(kind: YtmErrorKind | null): string {
  switch (kind) {
    case 'network':
      return "couldn't reach YouTube"
    case 'quotaExceeded':
      return 'YouTube quota used up · resumes after midnight Pacific'
    default:
      return 'sync failed — see Settings → YouTube Music'
  }
}
