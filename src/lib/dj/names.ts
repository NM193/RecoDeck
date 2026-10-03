// src/lib/dj/names.ts
/**
 * Who a DJ page is about, and which saved sets are theirs.
 *
 * `extractDjName` keeps a back-to-back billing whole ("Marco Carola b2b
 * Luciano"), which is right for filing the Sets library under one heading. A
 * DJ page needs each name on its own: a b2b set belongs to both DJs.
 */
import { foldAccents } from '../tracklist/text'
import { extractDjName } from '../tracklist/djName'
import type { WatchedDj, YtSetSummary } from '../../types/youtube'

/** " b2b ", " vs " or " vs. ", in any case. */
const BACK_TO_BACK = /\s+(?:b2b|vs\.?)\s+/i

/** What `extractDjName` answers when a title names nobody and there is no channel. */
const NOBODY = 'unknown'

/** A DJ page's key: the watched-DJ rule (`dj_key` in Rust) — trimmed, lower-case. */
export function djKey(name: string): string {
  return name.trim().toLowerCase()
}

/** "Marco Carola b2b Luciano" → ["Marco Carola", "Luciano"]. */
export function splitDjNames(name: string): string[] {
  return name
    .split(BACK_TO_BACK)
    .map((part) => part.trim())
    .filter(Boolean)
}

export interface BillingPart {
  text: string
  /** A DJ's name, which links to their page; false for "b2b" / "vs" and for nobody. */
  dj: boolean
}

/**
 * A billing as the open set's DJ chip shows it: each DJ on their own, with
 * "b2b" / "vs" as written between them. The DJs are exactly `splitDjNames`'s.
 */
export function billingParts(billing: string): BillingPart[] {
  // A capturing split keeps the separators, at the odd positions.
  return billing
    .split(new RegExp(`(${BACK_TO_BACK.source})`, BACK_TO_BACK.flags))
    .map((text, i) => ({ text: text.trim(), dj: i % 2 === 0 }))
    .filter((part) => part.text !== '')
    .map((part) =>
      part.dj && djKey(part.text) === NOBODY ? { ...part, dj: false } : part,
    )
}

/** Everyone who played a saved set: one name for a solo set, each name for a b2b. */
export function djNamesOfSet(
  set: Pick<YtSetSummary, 'title' | 'channel'>,
): string[] {
  return splitDjNames(extractDjName(set.title, set.channel))
}

/** The saved sets a DJ played, alone or back to back, in the order given. */
export function setsOfDj<T extends Pick<YtSetSummary, 'title' | 'channel'>>(
  sets: T[],
  key: string,
): T[] {
  return sets.filter((set) =>
    djNamesOfSet(set).some((name) => djKey(name) === key),
  )
}

export interface KnownDj {
  key: string
  /** The first spelling seen. */
  name: string
  /** Saved sets they played; 0 for a watched DJ with none saved yet. */
  setCount: number
}

/** Every DJ named in a saved set, then every watched DJ; most sets first. */
export function knownDjs(
  sets: Pick<YtSetSummary, 'title' | 'channel'>[],
  watched: Pick<WatchedDj, 'name_key' | 'display_name'>[],
): KnownDj[] {
  const byKey = new Map<string, KnownDj>()
  for (const set of sets) {
    // "X b2b X" is still one set for X.
    const counted = new Set<string>()
    for (const name of djNamesOfSet(set)) {
      const key = djKey(name)
      if (!key || key === NOBODY || counted.has(key)) continue
      counted.add(key)
      const dj = byKey.get(key) ?? { key, name, setCount: 0 }
      dj.setCount += 1
      byKey.set(key, dj)
    }
  }
  for (const dj of watched) {
    if (!byKey.has(dj.name_key)) {
      byKey.set(dj.name_key, {
        key: dj.name_key,
        name: dj.display_name,
        setCount: 0,
      })
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.setCount - a.setCount || a.name.localeCompare(b.name),
  )
}

/** Known DJs whose name contains the query, ignoring case and accents. An empty query finds nobody. */
export function findKnownDjs(known: KnownDj[], query: string): KnownDj[] {
  const fold = (value: string) => foldAccents(value).toLowerCase()
  const q = fold(query.trim())
  if (!q) return []
  return known.filter((dj) => fold(dj.key).includes(q))
}

/** Spotify's answers, minus the names Search already shows, at most `max`. */
export function newOnSpotify<T extends { name: string }>(
  shown: KnownDj[],
  results: T[],
  max: number,
): T[] {
  const keys = new Set(shown.map((dj) => dj.key))
  const out: T[] = []
  for (const result of results) {
    const key = djKey(result.name)
    if (keys.has(key)) continue
    keys.add(key)
    out.push(result)
    if (out.length === max) break
  }
  return out
}

/** A Search card's second line: "6 sets · you own 23", "on Spotify". */
export function djCardSubtitle(
  card: { setCount: number; owned: number | null } | 'spotify',
): string {
  if (card === 'spotify') return 'on Spotify'
  const sets =
    card.setCount === 0
      ? 'watched'
      : `${card.setCount} ${card.setCount === 1 ? 'set' : 'sets'}`
  return card.owned === null ? sets : `${sets} · you own ${card.owned}`
}
