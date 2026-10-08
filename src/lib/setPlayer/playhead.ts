// src/lib/setPlayer/playhead.ts
// Where a set's video is in its tracklist (Sets redesign spec, Playing): the
// track the playhead is inside, and the timed rows ⏮ / ⏭ step to. Taken
// from the position the panel reports, never from the row clicked last, so
// they hold right after Play set and once the video runs on into the next
// track.
import type { Track } from '../tracklist'

/** The rows the video can be sent to: those with a time, and the first (00:00). */
export function timedTracks(tracks: readonly Track[]): Track[] {
  return tracks.filter((t) => t.cueMs > 0 || t.index === 1)
}

export interface PlayheadTrack {
  track: Track
  startMs: number
  /** Where the next timed row starts; the last runs to the end of the video. */
  endMs: number
}

/** Position of the last timed row at or before `positionMs`; -1 before the first. */
function playheadIndex(timed: readonly Track[], positionMs: number): number {
  let index = -1
  for (let i = 0; i < timed.length; i += 1) {
    if (timed[i].cueMs <= positionMs) index = i
    else break
  }
  return index
}

/**
 * The track the playhead is inside, where it starts and where it ends; null
 * for an untimed list and before the first cue. `durationMs` is the video's
 * length (0 when unknown).
 */
export function playheadTrack(
  tracks: readonly Track[],
  untimed: boolean,
  positionMs: number,
  durationMs: number,
): PlayheadTrack | null {
  if (untimed) return null
  const timed = timedTracks(tracks)
  const index = playheadIndex(timed, positionMs)
  if (index < 0) return null
  const track = timed[index]
  const endMs = timed[index + 1]?.cueMs ?? durationMs
  return { track, startMs: track.cueMs, endMs: Math.max(endMs, track.cueMs + 1) }
}

/**
 * Where ⏮ (-1) or ⏭ (1) sends the video: the cue of the timed row before or
 * after the playhead's. Null at either end and for an untimed list.
 */
export function stepCue(
  tracks: readonly Track[],
  untimed: boolean,
  positionMs: number,
  direction: 1 | -1,
): number | null {
  if (untimed) return null
  const timed = timedTracks(tracks)
  const index = playheadIndex(timed, positionMs)
  const next = direction === 1 ? timed[index + 1] : index > 0 ? timed[index - 1] : undefined
  return next ? next.cueMs : null
}

/** A seek just sent: where the video was asked to go, and until when that holds. */
export interface PendingSeek {
  ms: number
  /** Date.now() until which a report far from it is the panel not there yet. */
  until: number
}

/** How long after a seek a far-off report is taken as stale. */
export const SEEK_SETTLE_MS = 1500
/** How far a report may be from the seek and still count as having arrived. */
const SEEK_NEAR_MS = 2500

/**
 * The position to believe: the panel's report, unless a seek was just sent
 * and the report is still far from it — the panel is polled every 400ms, so
 * for a moment after ⏭ it says where it was, and a second quick ⏭ must step
 * from where the first one went.
 */
export function believedPosition(reportedMs: number, pending: PendingSeek | null, now: number): number {
  if (!pending || now >= pending.until) return reportedMs
  return Math.abs(reportedMs - pending.ms) > SEEK_NEAR_MS ? pending.ms : reportedMs
}

/** Playing or buffering: the video means to play. YouTube numbers them 1 and 3. */
export function isPlayingState(state: number): boolean {
  return state === 1 || state === 3
}

/** A play or a pause just sent: what the video was asked to do, and until when that holds. */
export interface PendingState {
  playing: boolean
  until: number
}

/** How long after a play or pause a report that disagrees is taken as stale. */
export const STATE_SETTLE_MS = 1200

/**
 * The player state to believe: the report, unless a play or pause was just
 * sent and the report does not agree yet — the next poll still says what the
 * video was doing, and the button would flicker back for a moment.
 */
export function believedState(reported: number, pending: PendingState | null, now: number): number {
  if (!pending || now >= pending.until || isPlayingState(reported) === pending.playing) return reported
  return pending.playing ? 3 : 2
}
