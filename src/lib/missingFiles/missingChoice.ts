// What the user picked in the Missing Files review (spec 2026-10-15): per
// track Relink/Merge ("fix"), Leave or Remove, and which file. Pure
// functions, so the modal only renders. The views keep the backend's
// validation true at all times (spec, Conflicts): a free file is relinked
// by one row only, the lowest id.

import type {
  MissingCandidate,
  MissingFixes,
  MissingTrack,
} from '../../types/track'

export type FixState = 'fix' | 'leave' | 'remove'

/** Lengths within this many milliseconds match. */
export const LENGTH_TOLERANCE_MS = 2000

export interface MissingChoice {
  /** track id → the state the user picked. Absent: the default. */
  picked: Map<number, FixState>
  /** track id → the path of the file the user chose. Absent: the default. */
  chosen: Map<number, string>
  /** track id → a file picked with Locate… or Other file…. */
  located: Map<number, MissingCandidate>
}

export interface RowView {
  /** What applies: a blocked fix counts as leave. */
  state: FixState
  /** What the user, or the default, picked. */
  selected: FixState
  /** The row's files: a picked one first, then the same-name files. */
  candidates: MissingCandidate[]
  candidate: MissingCandidate | undefined
  /** The chosen file already is a library track: Merge, not Relink. */
  merge: boolean
  lengthDiffers: boolean
  /** The lower-id row that relinks the same file. */
  blockedBy: MissingTrack | undefined
}

export function emptyChoice(): MissingChoice {
  return { picked: new Map(), chosen: new Map(), located: new Map() }
}

function lengthsKnown(track: MissingTrack, c: MissingCandidate): boolean {
  return track.duration_ms != null && c.duration_ms != null
}

export function lengthMatches(
  track: MissingTrack,
  c: MissingCandidate,
): boolean {
  if (!lengthsKnown(track, c)) return false
  return (
    Math.abs((track.duration_ms as number) - (c.duration_ms as number)) <=
    LENGTH_TOLERANCE_MS
  )
}

function candidatesOf(
  track: MissingTrack,
  choice: MissingChoice,
): MissingCandidate[] {
  const located = choice.located.get(track.id)
  if (!located) return track.candidates
  return [located, ...track.candidates.filter((c) => c.path !== located.path)]
}

function chosenCandidate(
  track: MissingTrack,
  choice: MissingChoice,
  candidates: MissingCandidate[],
): MissingCandidate | undefined {
  const path = choice.chosen.get(track.id)
  const picked = candidates.find((c) => c.path === path)
  if (picked) return picked
  return candidates.find((c) => lengthMatches(track, c)) ?? candidates[0]
}

function defaultState(
  track: MissingTrack,
  candidate: MissingCandidate | undefined,
): FixState {
  return candidate && lengthMatches(track, candidate) && !track.drive_missing
    ? 'fix'
    : 'leave'
}

/** Every row's view, computed in id order so the lower id wins a shared file. */
export function rowViews(
  tracks: MissingTrack[],
  choice: MissingChoice,
): Map<number, RowView> {
  const views = new Map<number, RowView>()
  const claims = new Map<string, MissingTrack>()
  for (const track of [...tracks].sort((a, b) => a.id - b.id)) {
    const candidates = candidatesOf(track, choice)
    const candidate = chosenCandidate(track, choice, candidates)
    let selected = choice.picked.get(track.id) ?? defaultState(track, candidate)
    if (selected === 'fix' && !candidate) selected = 'leave'
    const merge = candidate?.library_track_id != null
    let blockedBy: MissingTrack | undefined
    if (selected === 'fix' && candidate && !merge) {
      blockedBy = claims.get(candidate.path)
      if (!blockedBy) claims.set(candidate.path, track)
    }
    views.set(track.id, {
      state: blockedBy ? 'leave' : selected,
      selected,
      candidates,
      candidate,
      merge,
      lengthDiffers:
        candidate !== undefined &&
        lengthsKnown(track, candidate) &&
        !lengthMatches(track, candidate),
      blockedBy,
    })
  }
  return views
}

export function setState(
  choice: MissingChoice,
  trackId: number,
  state: FixState,
): MissingChoice {
  const picked = new Map(choice.picked)
  picked.set(trackId, state)
  return { ...choice, picked }
}

export function chooseFile(
  choice: MissingChoice,
  trackId: number,
  path: string,
): MissingChoice {
  const chosen = new Map(choice.chosen)
  chosen.set(trackId, path)
  return { ...choice, chosen }
}

/** A picked file becomes the row's chosen file, set to Relink/Merge. */
export function locate(
  choice: MissingChoice,
  trackId: number,
  file: MissingCandidate,
): MissingChoice {
  const located = new Map(choice.located)
  located.set(trackId, file)
  const chosen = new Map(choice.chosen)
  chosen.set(trackId, file.path)
  const picked = new Map(choice.picked)
  picked.set(trackId, 'fix')
  return { picked, chosen, located }
}

/** After a reload: the picked files as described again (gone ones left out). */
export function withLocated(
  choice: MissingChoice,
  located: Map<number, MissingCandidate>,
): MissingChoice {
  return { ...choice, located }
}

/** What the backend gets. */
export function buildFixes(
  tracks: MissingTrack[],
  choice: MissingChoice,
): MissingFixes {
  const views = rowViews(tracks, choice)
  const fixes: MissingFixes = { relinks: [], merges: [], removes: [] }
  for (const track of tracks) {
    const view = views.get(track.id)
    if (!view) continue
    if (view.state === 'remove') {
      fixes.removes.push(track.id)
    } else if (view.state === 'fix' && view.candidate) {
      const keep = view.candidate.library_track_id
      if (keep != null) fixes.merges.push({ keep_id: keep, remove_id: track.id })
      else fixes.relinks.push({ track_id: track.id, path: view.candidate.path })
    }
  }
  return fixes
}

/** "Relink 2 · Merge 1 · Remove 1", or "Nothing to apply". */
export function actionLabel(fixes: MissingFixes): string {
  const parts: string[] = []
  if (fixes.relinks.length > 0) parts.push(`Relink ${fixes.relinks.length}`)
  if (fixes.merges.length > 0) parts.push(`Merge ${fixes.merges.length}`)
  if (fixes.removes.length > 0) parts.push(`Remove ${fixes.removes.length}`)
  return parts.join(' · ') || 'Nothing to apply'
}
