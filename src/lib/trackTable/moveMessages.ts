// src/lib/trackTable/moveMessages.ts
// Move to folder's words and bookkeeping (track table spec, Move to folder):
// the folder a track is in, which folder to grey, what the toast says and
// shows on hover, and how an Undo moves the tracks back — once per folder
// they came from.
import type { MoveSkipReason, Track } from '../../types/track'
import { tracksSubject } from './bulkMessages'

/** Why a track stayed: the backend's reasons, and the track playing now. */
export type SkipReason = MoveSkipReason | 'playing'

export interface Skip {
  id: number
  reason: SkipReason
}

const REASON_TEXT: Record<SkipReason, string> = {
  playing: 'playing now',
  already_there: 'already there',
  name_taken: 'a file with that name is there',
  missing: 'file not found',
  failed: "couldn't move",
}

/** The folder a stored path is in (tracks store `/` on Windows too). */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

/** The folder every track is in, if they share one: Move to folder greys it. */
export function sharedFolder(tracks: readonly Pick<Track, 'file_path'>[]): string | null {
  if (tracks.length === 0) return null
  const folder = folderOf(tracks[0].file_path)
  return tracks.every((t) => folderOf(t.file_path) === folder) ? folder : null
}

/** "House", from the label "Music / House". */
export function folderName(label: string): string {
  return label.split(' / ').pop() ?? label
}

/**
 * "Moved 3 tracks to House"; with skips, "Moved 2 · 1 skipped (playing
 * now)" — the reason when every skip shares one; "Nothing moved · …" when
 * none moved.
 */
export function movedMessage(
  moved: readonly Pick<Track, 'title'>[],
  skipped: readonly Skip[],
  folder: string,
): string {
  if (skipped.length === 0) return `Moved ${tracksSubject(moved)} to ${folder}`
  const reasons = new Set(skipped.map((s) => s.reason))
  const why = reasons.size === 1 ? ` (${REASON_TEXT[skipped[0].reason]})` : ''
  const head = moved.length > 0 ? `Moved ${moved.length.toLocaleString('en-US')}` : 'Nothing moved'
  return `${head} · ${skipped.length.toLocaleString('en-US')} skipped${why}`
}

/** One line per skipped track, for the toast's hover: "Juz Listen' — playing now". */
export function skipDetail(
  skipped: readonly Skip[],
  titleOf: (id: number) => string | undefined,
  limit = 6,
): string {
  const lines = skipped
    .slice(0, limit)
    .map((s) => `${titleOf(s.id) || 'A track'} — ${REASON_TEXT[s.reason]}`)
  if (skipped.length > limit) lines.push(`and ${skipped.length - limit} more`)
  return lines.join('\n')
}

/** Undo moves the tracks back once per folder they came from. */
export function undoGroups(
  moved: readonly { id: number }[],
  oldPath: (id: number) => string,
): Array<{ folder: string; ids: number[] }> {
  const groups = new Map<string, number[]>()
  for (const { id } of moved) {
    const folder = folderOf(oldPath(id))
    groups.set(folder, [...(groups.get(folder) ?? []), id])
  }
  return [...groups].map(([folder, ids]) => ({ folder, ids }))
}
