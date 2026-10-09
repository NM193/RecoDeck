// src/lib/trackTable/selection.ts
// The rows selected in a track table (track table spec, Selecting several):
// a click selects one row, ⌘-click adds or removes one, Shift-click selects
// the range from the anchor (the row clicked last), ⌘A every row shown, and
// ↑ ↓ move it (Shift extends the range). Rows no longer shown leave it. Pure:
// the table keeps it in state and gives the shown rows' ids, in their order.

export interface Selection {
  /** The selected tracks' ids. */
  readonly ids: ReadonlySet<number>
  /** Where a Shift range starts: the row clicked last, or moved to without Shift. */
  readonly anchor: number | null
  /** The row ↑ ↓ move from and Enter plays: the row clicked or moved to last. */
  readonly cursor: number | null
}

export const NO_SELECTION: Selection = { ids: new Set(), anchor: null, cursor: null }

/** The keys held with a click: ⌘ (Ctrl on Windows) and Shift. */
export interface ClickKeys {
  toggle: boolean
  range: boolean
}

/** One row alone, as a plain click selects it. */
export function selectOnly(id: number): Selection {
  return { ids: new Set([id]), anchor: id, cursor: id }
}

// From the anchor to `id`, in the order shown; with `keep`, added to the rows
// already selected. No anchor among the rows shown: `id` alone.
function rangeTo(
  selection: Selection,
  id: number,
  shown: readonly number[],
  keep: boolean,
): Selection {
  const anchor = selection.anchor ?? id
  const from = shown.indexOf(anchor)
  const to = shown.indexOf(id)
  if (from === -1 || to === -1) return selectOnly(id)
  const ids = new Set(keep ? selection.ids : [])
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) ids.add(shown[i])
  return { ids, anchor, cursor: id }
}

/** A click on a row, with the keys held. */
export function clickRow(
  selection: Selection,
  id: number,
  keys: ClickKeys,
  shown: readonly number[],
): Selection {
  if (keys.range) return rangeTo(selection, id, shown, keys.toggle)
  if (!keys.toggle) return selectOnly(id)
  const ids = new Set(selection.ids)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  return { ids, anchor: id, cursor: id }
}

/** ⌘A: every row shown. */
export function selectAll(selection: Selection, shown: readonly number[]): Selection {
  return { ...selection, ids: new Set(shown) }
}

/**
 * ↓ (1) or ↑ (-1) from the cursor, stopping at the ends; with nothing to
 * move from, ↓ takes the first row and ↑ the last. With Shift, the range from
 * the anchor follows the cursor.
 */
export function moveCursor(
  selection: Selection,
  shown: readonly number[],
  step: 1 | -1,
  extend: boolean,
): Selection {
  if (shown.length === 0) return selection
  const at = selection.cursor === null ? -1 : shown.indexOf(selection.cursor)
  const next =
    at === -1
      ? step === 1
        ? 0
        : shown.length - 1
      : Math.min(shown.length - 1, Math.max(0, at + step))
  return extend ? rangeTo(selection, shown[next], shown, false) : selectOnly(shown[next])
}

/** Only the rows still shown; the same selection when every one of them is. */
export function trimSelection(selection: Selection, shown: readonly number[]): Selection {
  const visible = new Set(shown)
  const keep = (id: number | null) => (id !== null && visible.has(id) ? id : null)
  const ids = [...selection.ids].filter((id) => visible.has(id))
  if (
    ids.length === selection.ids.size &&
    keep(selection.anchor) === selection.anchor &&
    keep(selection.cursor) === selection.cursor
  ) {
    return selection
  }
  return { ids: new Set(ids), anchor: keep(selection.anchor), cursor: keep(selection.cursor) }
}

/** The selected tracks, in the order shown. */
export function selectedTracks<T extends { id: number }>(
  selection: Selection,
  shown: readonly T[],
): T[] {
  return shown.filter((track) => selection.ids.has(track.id))
}
