/**
 * What a search result promises, before anything is paid to open it.
 *
 * A search returns titles and nothing that says whether any of them carries a
 * tracklist, so the only way to find out used to be to open one at 5-7 units
 * and see. The descriptions come back for a single unit across the whole page,
 * and the parser that reads a stored set reads them just as well — so the same
 * rules that decide a real tracklist decide this one.
 */

import { extractNumberedList, extractTracklist } from './extract'

export interface SetPreview {
  /** Tracks found in the description alone. */
  trackCount: number
  /** The description's list carries no timestamps. */
  untimed: boolean
  /** Comments that might hold one where the description does not. */
  commentCount: number | null
  durationMs: number | null
}

export function previewSet({
  description,
  durationMs,
  commentCount,
}: {
  description?: string
  durationMs?: number
  commentCount?: number
}): SetPreview {
  const base = {
    commentCount: commentCount ?? null,
    durationMs: durationMs ?? null,
  }
  if (!description) return { trackCount: 0, untimed: false, ...base }

  const timed = extractTracklist(description, durationMs ?? 0)
  if (timed.tracks.length) {
    return { trackCount: timed.tracks.length, untimed: false, ...base }
  }

  // The same fallback the full parser uses, and for the same reason: a numbered
  // list with no cues is still a tracklist.
  const numbered = extractNumberedList(description)
  return { trackCount: numbered.tracks.length, untimed: numbered.tracks.length > 0, ...base }
}

/** One line saying what is in there, for the row under the title. */
export function describePreview(preview: SetPreview): string {
  if (preview.trackCount > 0) {
    return `${preview.trackCount} tracks in the description${
      preview.untimed ? ', no timestamps' : ''
    }`
  }
  if (preview.commentCount && preview.commentCount > 0) {
    return `nothing in the description · ${preview.commentCount.toLocaleString()} comments to search`
  }
  if (preview.commentCount === 0) {
    // Nothing in the description and nowhere else to look.
    return 'no tracklist in the description, and comments are off'
  }
  return 'nothing in the description'
}
