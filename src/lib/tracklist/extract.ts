/**
 * Pulls a tracklist out of one block of text — a video description, or a single
 * comment — and scores how much it actually looks like one.
 */

import type { ExtractedTrack } from './types'
import {
  TRACK_LINE,
  UNKNOWN_TOKEN,
  normalise,
  parseCue,
  splitArtistTitle,
  stripRangeEnd,
} from './text'

export interface ExtractResult {
  tracks: ExtractedTrack[]
  confidence: number
}

export function extractTracklist(text: string, durationMs: number): ExtractResult {
  const tracks: ExtractedTrack[] = []

  for (const line of text.split(/\r?\n/)) {
    const match = TRACK_LINE.exec(line)
    if (!match) continue

    const cue = match[1]
    // Some lists write a range: "00:01 - 01:00  Artist - Title". The second
    // timestamp is the end of the slot, not part of the artist's name.
    const rest = stripRangeEnd(match[2])
    // "ID" is only two characters, but it is exactly the row we care about.
    if (!rest || (rest.length < 3 && !UNKNOWN_TOKEN.test(rest.trim()))) continue

    const cueMs = parseCue(cue)
    if (durationMs > 0 && cueMs > durationMs * 1.05) continue // timestamp outside the set

    const parsed = splitArtistTitle(rest)
    tracks.push({
      index: tracks.length + 1,
      cue,
      cueMs,
      ...parsed,
      artistNorm: normalise(parsed.artist),
      titleNorm: normalise([parsed.title, parsed.mix].filter(Boolean).join(' ')),
      raw: line.trim(),
    })
  }

  if (tracks.length < 4) return { tracks: [], confidence: 0 }

  const ascending =
    tracks.filter((t, i) => i === 0 || t.cueMs >= tracks[i - 1].cueMs).length / tracks.length
  const withArtist = tracks.filter((t) => t.artist).length / tracks.length
  const last = tracks[tracks.length - 1]
  const coverage = durationMs > 0 ? Math.min(1, last.cueMs / (durationMs * 0.6)) : 0.8

  // A missing "Artist - " prefix is weak evidence of chapters rather than a
  // tracklist, but it cannot be decisive: a producer playing their own material
  // is listed by title alone, and that is still a real tracklist. Without this
  // floor, such a set scored zero and was thrown away as a false positive.
  const artistShape = 0.5 + 0.5 * withArtist
  const confidence = Number((ascending * artistShape * coverage).toFixed(3))

  return { tracks, confidence }
}
