// src/lib/dj/plays.ts
/**
 * "What they play": the named tracks of a DJ's saved sets, most-played first.
 *
 * A track counts once per set, however many times the tracklist names it —
 * the question is in how many of their sets it turns up. Unknown slots ("ID")
 * are left out: they say a record was played, not which.
 */
import { foldAccents, normalise } from '../tracklist/text'
import {
  ownershipOf,
  type Ownership,
  type OwnershipIndex,
} from '../spotify/ownership'
import { selectedRecsSearchUrl } from '../spotify/title'
import type { DjSetTrack } from '../../types/dj'

export interface Play {
  /** Normalised artist + title + mix. */
  key: string
  /** As the first set that named it wrote it. */
  artist: string | null
  title: string
  mix: string | null
  /** In how many of the DJ's sets it turns up. */
  count: number
}

/** Accent-folded norm; a name with no Latin letters keeps its lower-cased text. */
function keyPart(value: string | null): string {
  if (!value) return ''
  return normalise(foldAccents(value)) || value.trim().toLowerCase()
}

function keyOf(row: Pick<DjSetTrack, 'artist' | 'title' | 'mix'>): string {
  return [keyPart(row.artist), keyPart(row.title), keyPart(row.mix)].join('|')
}

/** Most-played first; ties by artist, then title, then mix (the plain record before its versions). */
export function countPlays(rows: DjSetTrack[]): Play[] {
  const plays = new Map<string, Play>()
  const setsOf = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.isUnknown || !row.title.trim()) continue
    const key = keyOf(row)
    const sets = setsOf.get(key) ?? new Set<string>()
    sets.add(row.videoId)
    setsOf.set(key, sets)
    const play = plays.get(key) ?? {
      key,
      artist: row.artist,
      title: row.title,
      mix: row.mix,
      count: 0,
    }
    play.count = sets.size
    plays.set(key, play)
  }
  return [...plays.values()].sort(
    (a, b) =>
      b.count - a.count ||
      (a.artist ?? '').localeCompare(b.artist ?? '') ||
      a.title.localeCompare(b.title) ||
      (a.mix ?? '').localeCompare(b.mix ?? ''),
  )
}

/** Owned / Maybe / Missing for a play, by the Spotify section's matcher. */
export function playOwnership(play: Play, index: OwnershipIndex): Ownership {
  return ownershipOf(
    {
      artist: play.artist,
      title: play.title,
      mix: play.mix,
      artistNorm: normalise(play.artist),
      titleNorm: normalise([play.title, play.mix].filter(Boolean).join(' ')),
    },
    index,
  )
}

/** "Artist - Title (Mix)", the shape Copy gives everywhere. */
export function playText(play: Play): string {
  const name = play.mix ? `${play.title} (${play.mix})` : play.title
  return play.artist ? `${play.artist} - ${name}` : name
}

/** SelectedRecs, searched without the mix — as for Spotify rows. */
export function playSearchUrl(play: Play): string {
  return selectedRecsSearchUrl(
    play.artist ? `${play.artist} - ${play.title}` : play.title,
  )
}
