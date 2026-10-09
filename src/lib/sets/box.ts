// src/lib/sets/box.ts
// What Sets' one box offers for what is typed in it (Sets redesign spec,
// Sets home): a YouTube link opens that set; text of two characters or more
// finds what is stored, free, and offers the one search that spends quota;
// an empty box offers nothing.
import { extractDjName } from '../tracklist/djName'
import type { YtSetSummary } from '../../types/youtube'

/** The most stored sets, and track hits, the dropdown lists. */
export const YOUR_SETS_MAX = 5
export const TRACK_HITS_MAX = 8

export type BoxOffer =
  | { kind: 'empty' }
  /** A link or a bare id: opening it is free when it is stored, else 5–7 units. */
  | { kind: 'link'; videoId: string; stored: boolean }
  | { kind: 'text'; query: string }

/** The video id in a YouTube link (watch, youtu.be, embed, live, shorts) or a bare 11-character id. */
export function videoIdOf(input: string): string | null {
  const text = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text
  const match = /(?:[?&]v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)([A-Za-z0-9_-]{11})/.exec(text)
  return match ? match[1] : null
}

export function boxOffer(input: string, storedIds: ReadonlySet<string>): BoxOffer {
  const videoId = videoIdOf(input)
  if (videoId) return { kind: 'link', videoId, stored: storedIds.has(videoId) }
  const query = input.trim()
  return query.length >= 2 ? { kind: 'text', query } : { kind: 'empty' }
}

/** Lower-cased and without accents, so "hor" finds "HÖR Berlin". */
function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** The stored sets whose title, DJ or channel holds the text, as the library lists them, at most `limit`. */
export function matchingSets(
  sets: readonly YtSetSummary[],
  query: string,
  limit = YOUR_SETS_MAX,
): YtSetSummary[] {
  const needle = folded(query.trim())
  if (!needle) return []
  return sets
    .filter((set) =>
      [set.title, set.channel ?? '', extractDjName(set.title, set.channel)].some((field) =>
        folded(field).includes(needle),
      ),
    )
    .slice(0, limit)
}

/** A set card's line: "Cercle · 41 tracks", or "no tracklist yet". */
export function setCardLine(set: Pick<YtSetSummary, 'channel' | 'track_count'>): string {
  const tracks = set.track_count ?? 0
  const count = tracks > 0 ? `${tracks.toLocaleString('en-US')} ${tracks === 1 ? 'track' : 'tracks'}` : 'no tracklist yet'
  return set.channel ? `${set.channel} · ${count}` : count
}
