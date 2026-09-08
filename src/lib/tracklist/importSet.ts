/**
 * Fetching a set, parsing it and storing it — the one path, wherever it starts.
 *
 * The parser is TypeScript, so a set cannot be imported from Rust: the backend
 * can fetch the raw JSON but has nothing to turn it into a tracklist. That is
 * why automatic import runs here, on an event from the backend, rather than in
 * the background task that found the set.
 */

import { tauriApi } from '../tauri-api'
import { analyse } from './index'
import type { RawSet, TracklistResult } from './types'

/** What one set costs to fetch: a videos call plus its comment pages. */
export const SET_COST_UNITS = 7

/**
 * What automatic import will not spend below.
 *
 * A search that turns up seven sets is another fifty units on top of the
 * hundred the search cost. Left uncapped, one good day of new releases could
 * work through the allowance while nobody was looking, and the first sign of it
 * would be a set that refuses to open.
 */
export const AUTO_IMPORT_RESERVE = 1_000

/** At most this many in one go, however much quota is left. */
export const AUTO_IMPORT_MAX = 5

/**
 * Which of these sets may be imported unattended.
 *
 * Pure, because it is the rule that decides how much of someone's daily
 * allowance the app spends on its own — the kind of arithmetic that has to be
 * right whether or not anyone is watching it happen.
 */
export function setsToAutoImport(
  videoIds: string[],
  remainingQuota: number,
  {
    reserve = AUTO_IMPORT_RESERVE,
    max = AUTO_IMPORT_MAX,
    cost = SET_COST_UNITS,
  }: { reserve?: number; max?: number; cost?: number } = {},
): string[] {
  const spendable = Math.max(0, remainingQuota - reserve)
  const affordable = Math.floor(spendable / cost)
  return videoIds.slice(0, Math.min(affordable, max))
}

/** Flattens a parsed result into the shape the store command expects. */
export async function storeParsedSet(raw: RawSet, parsed: TracklistResult) {
  await tauriApi
    .saveYouTubeSet({
      raw,
      status: parsed.status,
      confidence: parsed.confidence,
      source_count: parsed.sourceCount,
      track_count: parsed.trackCount,
      // Flattened here so searching across sets and the statistics are plain
      // queries rather than a reparse of everything on every keystroke.
      tracks: parsed.tracks.map((t) => ({
        cue_ms: t.cueMs,
        cue: t.cue,
        artist: t.artist ?? undefined,
        title: t.title,
        mix: t.mix ?? undefined,
        is_unknown: t.isUnknown,
        votes: t.votes,
        source_count: t.sourceCount,
        artist_norm: t.artistNorm ?? undefined,
        title_norm: t.titleNorm ?? undefined,
      })),
    })
    .catch(() => {})
}

/**
 * Fetches one set, parses it and stores it. Costs 5-7 units.
 *
 * `onlyIfTracks` withholds the storing, not the fetching — by the time anything
 * can be judged the units are already spent. It exists because the automatic
 * import filed a set with **nought** tracks into the library on its own, and a
 * library nobody chose to fill has to earn every row in it. Somebody importing
 * a set by hand asked for it and can see for themselves.
 */
export async function importSet(
  videoId: string,
  { onlyIfTracks = false }: { onlyIfTracks?: boolean } = {},
): Promise<{ parsed: TracklistResult; stored: boolean }> {
  const raw = await tauriApi.fetchYouTubeSet(videoId)
  const parsed = analyse(raw.video, raw.comments)

  if (onlyIfTracks && parsed.trackCount === 0) {
    return { parsed, stored: false }
  }

  await storeParsedSet(raw, parsed)
  return { parsed, stored: true }
}
