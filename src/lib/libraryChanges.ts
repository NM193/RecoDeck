// After a Duplicates merge or a Missing Files apply, the player's queue
// follows the library: a merged copy becomes the track it merged into, a
// removed track leaves the queue, a relinked one plays from its new path.

import { usePlayerStore } from '../store/playerStore'
import type {
  MergeRequest,
  MissingFixes,
  MissingFixSummary,
  Track,
} from '../types/track'
import { tauriApi } from './tauri-api'

export interface LibraryChanges {
  /** [removed copy's id, kept track's id] */
  merged: [number, number][]
  removed: number[]
  /** track id → its new path */
  moved: ReadonlyMap<number, string>
}

/** What a Duplicates merge changed. */
export function mergeChanges(merges: MergeRequest[]): LibraryChanges {
  return {
    merged: merges.flatMap((m) =>
      m.remove_ids.map((id): [number, number] => [id, m.keep_id]),
    ),
    removed: [],
    moved: new Map(),
  }
}

/** What a Missing Files apply changed: the fixes minus the skipped ones. */
export function missingFixChanges(
  fixes: MissingFixes,
  summary: MissingFixSummary,
): LibraryChanges {
  const skipped = new Set(summary.skipped.map((s) => s.track_id))
  return {
    merged: fixes.merges
      .filter((m) => !skipped.has(m.remove_id))
      .map((m): [number, number] => [m.remove_id, m.keep_id]),
    removed: fixes.removes.filter((id) => !skipped.has(id)),
    moved: new Map(
      fixes.relinks
        .filter((r) => !skipped.has(r.track_id))
        .map((r) => [r.track_id, r.path]),
    ),
  }
}

/** Updates the queue; reads a kept track only when its copy is queued. */
export async function followInQueue(
  changes: LibraryChanges,
  getTrack: (id: number) => Promise<Track> = (id) => tauriApi.getTrack(id),
): Promise<void> {
  if (changes.moved.size > 0) {
    usePlayerStore.getState().patchTrackPaths(changes.moved)
  }
  const { queue, originalQueue, currentTrack } = usePlayerStore.getState()
  const queued = new Set(
    [...queue, ...originalQueue, ...(currentTrack ? [currentTrack] : [])].map(
      (t) => t.id,
    ),
  )
  const replacements = new Map<number, Track | null>()
  for (const id of changes.removed) {
    if (queued.has(id)) replacements.set(id, null)
  }
  const kept = new Map<number, Track | null>()
  for (const [removed, keep] of changes.merged) {
    if (!queued.has(removed)) continue
    if (!kept.has(keep)) {
      kept.set(keep, await getTrack(keep).catch(() => null))
    }
    replacements.set(removed, kept.get(keep) ?? null)
  }
  if (replacements.size > 0) {
    usePlayerStore.getState().replaceTracks(replacements)
  }
}
