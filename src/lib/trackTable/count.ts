// src/lib/trackTable/count.ts
// The count at the right of the track table's toolbar.

const format = (n: number) => n.toLocaleString('en-US')

/**
 * "8,583 tracks" with no search or filter, "1,162 of 8,583 tracks" while
 * either narrows the view. `total` is the view's: the whole library in All
 * Tracks, the folder's or the playlist's tracks elsewhere.
 */
export function trackCountLabel(shown: number, total: number, narrowed: boolean): string {
  const noun = total === 1 ? 'track' : 'tracks'
  return narrowed
    ? `${format(shown)} of ${format(total)} ${noun}`
    : `${format(total)} ${noun}`
}
