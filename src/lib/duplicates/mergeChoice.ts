// What the user picked in the Duplicate Tracks modal (Duplicates Merge spec):
// in each group one kept copy, and every other copy either merged into it or
// left as is. Pure functions, so the modal only renders.

import type { DuplicateGroup, DuplicateTrack, MergeRequest } from '../../types/track'

export interface MergeChoice {
  /** group key → the kept copy's id */
  keep: Map<number, number>
  /** ids of copies left as is */
  left: Set<number>
}

export type RowState = 'keep' | 'merge' | 'left'

/** A group's key: its first copy's id (a copy is in one group only). */
export function groupKey(group: DuplicateGroup): number {
  return group.tracks[0]?.id ?? -1
}

/** On open: keep the recommended copy, merge every other one. */
export function initialChoice(groups: DuplicateGroup[]): MergeChoice {
  const keep = new Map<number, number>()
  for (const g of groups) keep.set(groupKey(g), g.recommended_keep_id)
  return { keep, left: new Set() }
}

export function rowState(
  choice: MergeChoice,
  group: DuplicateGroup,
  trackId: number,
): RowState {
  if (choice.keep.get(groupKey(group)) === trackId) return 'keep'
  return choice.left.has(trackId) ? 'left' : 'merge'
}

/** Keep this copy instead. The old kept copy becomes a merged one. */
export function pickKeep(
  choice: MergeChoice,
  group: DuplicateGroup,
  trackId: number,
): MergeChoice {
  const keep = new Map(choice.keep)
  keep.set(groupKey(group), trackId)
  const left = new Set(choice.left)
  left.delete(trackId)
  return { keep, left }
}

/** Merge ↔ left as is. The kept copy does not toggle. */
export function toggleMerge(
  choice: MergeChoice,
  group: DuplicateGroup,
  trackId: number,
): MergeChoice {
  if (rowState(choice, group, trackId) === 'keep') return choice
  const left = new Set(choice.left)
  if (left.has(trackId)) left.delete(trackId)
  else left.add(trackId)
  return { keep: choice.keep, left }
}

/** Merge all / Merge none, for the given (visible) groups. */
export function setMergeAll(
  choice: MergeChoice,
  groups: DuplicateGroup[],
  merge: boolean,
): MergeChoice {
  const left = new Set(choice.left)
  for (const g of groups) {
    for (const t of g.tracks) {
      if (rowState(choice, g, t.id) === 'keep') continue
      if (merge) left.delete(t.id)
      else left.add(t.id)
    }
  }
  return { keep: choice.keep, left }
}

/** True when the groups have a copy to merge and every one is checked. */
export function allMerged(choice: MergeChoice, groups: DuplicateGroup[]): boolean {
  let any = false
  for (const g of groups) {
    for (const t of g.tracks) {
      const state = rowState(choice, g, t.id)
      if (state === 'left') return false
      if (state === 'merge') any = true
    }
  }
  return any
}

/** What the backend gets: one entry per group with a copy to merge. */
export function buildMerges(
  choice: MergeChoice,
  groups: DuplicateGroup[],
): MergeRequest[] {
  const out: MergeRequest[] = []
  for (const g of groups) {
    const keepId = choice.keep.get(groupKey(g))
    if (keepId === undefined) continue
    const remove_ids = g.tracks
      .filter((t) => rowState(choice, g, t.id) === 'merge')
      .map((t) => t.id)
    if (remove_ids.length > 0) out.push({ keep_id: keepId, remove_ids })
  }
  return out
}

export function mergeCount(choice: MergeChoice, groups: DuplicateGroup[]): number {
  return buildMerges(choice, groups).reduce((n, m) => n + m.remove_ids.length, 0)
}

/** This copy's playlist slots that move: playlists the kept copy is not in. */
export function slotsMoving(
  group: DuplicateGroup,
  keepId: number,
  track: DuplicateTrack,
): number {
  const kept = group.tracks.find((t) => t.id === keepId)
  const keptIn = new Set((kept?.playlists ?? []).map((p) => p.id))
  return track.playlists.filter((p) => !keptIn.has(p.id)).length
}
