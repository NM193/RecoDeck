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

/**
 * People narrate sets in the comments with timestamps — "1:10:13 tattoo girl
 * checks on the lad, she doesnt know yet" — and a block of those parses as a
 * perfectly ascending tracklist inside the runtime. It then merges into the
 * real list and shows up as tracks.
 *
 * A row is prose when nobody is credited and it runs on like a sentence. The
 * threshold is measured, not guessed: across the six reference sets the longest
 * legitimate artist-less title is six words, while narration runs 8 to 18.
 */
const PROSE_MIN_WORDS = 7

/**
 * How much prose it takes to disqualify the whole block.
 *
 * Judged per block rather than per row on purpose. A narration also contains
 * short lines ("Lad with red hat acquires target") that no row-level rule can
 * tell from a title — but they sit among long ones, and the block as a whole is
 * unmistakable. None of the six reference sets contains a single prose row, so
 * this rejects nothing that was working.
 */
const PROSE_BLOCK_RATIO = 0.25

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function isProse(track: ExtractedTrack): boolean {
  return !track.artist && wordCount(track.title) >= PROSE_MIN_WORDS
}

export function extractTracklist(
  text: string,
  durationMs: number,
): ExtractResult {
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
      index: 0, // assigned below, after prose rows are dropped
      cue,
      cueMs,
      ...parsed,
      artistNorm: normalise(parsed.artist),
      titleNorm: normalise(
        [parsed.title, parsed.mix].filter(Boolean).join(' '),
      ),
      raw: line.trim(),
    })
  }

  // A block that is largely prose is somebody telling a story, not a tracklist.
  const proseRows = tracks.filter(isProse).length
  if (tracks.length && proseRows / tracks.length >= PROSE_BLOCK_RATIO) {
    return { tracks: [], confidence: 0 }
  }

  // A stray prose row inside an otherwise real list is dropped on its own.
  const kept = tracks.filter((t) => !isProse(t)).map((t, i) => ({ ...t, index: i + 1 }))
  tracks.length = 0
  tracks.push(...kept)

  if (tracks.length < 4) return { tracks: [], confidence: 0 }

  const ascending =
    tracks.filter((t, i) => i === 0 || t.cueMs >= tracks[i - 1].cueMs).length /
    tracks.length
  const withArtist = tracks.filter((t) => t.artist).length / tracks.length
  const last = tracks[tracks.length - 1]
  const coverage =
    durationMs > 0 ? Math.min(1, last.cueMs / (durationMs * 0.6)) : 0.8

  // A missing "Artist - " prefix is weak evidence of chapters rather than a
  // tracklist, but it cannot be decisive: a producer playing their own material
  // is listed by title alone, and that is still a real tracklist. Without this
  // floor, such a set scored zero and was thrown away as a false positive.
  const artistShape = 0.5 + 0.5 * withArtist
  const confidence = Number((ascending * artistShape * coverage).toFixed(3))

  return { tracks, confidence }
}
