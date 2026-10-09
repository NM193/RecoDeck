// src/lib/trackTable/count.ts
// The count at the right of the track table's toolbar.

const format = (n: number) => n.toLocaleString('en-US')

/**
 * "8,583 tracks" with no search or filter, "1,162 of 8,583 tracks" while
 * either narrows the view. `total` is the view's: the whole library in All
 * Tracks, the folder's or the playlist's tracks elsewhere. With several rows
 * selected it starts "3 selected · " (one row is just the row clicked).
 */
export function trackCountLabel(
  shown: number,
  total: number,
  narrowed: boolean,
  selected = 0,
): string {
  const noun = total === 1 ? 'track' : 'tracks'
  const count = narrowed
    ? `${format(shown)} of ${format(total)} ${noun}`
    : `${format(total)} ${noun}`
  return selected > 1 ? `${format(selected)} selected · ${count}` : count
}
