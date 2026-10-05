// src/lib/trackTable/reorder.ts
// Reordering a playlist by dragging (track table spec, Dragging): the dragged
// tracks land together at the gap the line shows, in the order they had; the
// others keep theirs.

/**
 * The order after moving `moving` to `gap`, a place between rows of `order`:
 * 0 is before the first, `order.length` after the last. The same array when
 * nothing would move.
 */
export function reorderIds(
  order: readonly number[],
  moving: ReadonlySet<number>,
  gap: number,
): readonly number[] {
  const before = order.slice(0, gap).filter((id) => !moving.has(id))
  const moved = order.filter((id) => moving.has(id))
  const after = order.slice(gap).filter((id) => !moving.has(id))
  const next = [...before, ...moved, ...after]
  return next.every((id, i) => id === order[i]) ? order : next
}
