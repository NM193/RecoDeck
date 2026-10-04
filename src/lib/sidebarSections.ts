/**
 * How the sidebar's open sections share its height. Pure: the measuring lives
 * in `components/layout/useSectionHeights.ts`.
 */

/** An open list never shrinks below this — about three rows. */
export const MIN_BODY_HEIGHT = 96

/**
 * The height each open list gets, in the order given.
 *
 * Lists that fit in an equal share of what is left keep their whole height,
 * shortest first; the rest share the remainder equally and scroll inside.
 * Flexbox cannot do this on its own: it shrinks every item in proportion to
 * its size, so a short list would scroll too.
 *
 * A list is never given less than `MIN_BODY_HEIGHT`, or its own height if that
 * is shorter. When even that does not fit, the heights add up to more than
 * `available` and the section area scrolls as a whole.
 *
 * @param available the height for the lists: the section area minus headers and dividers.
 * @param natural each open list's own height.
 */
export function distributeHeights(
  available: number,
  natural: number[],
): number[] {
  const out = new Array<number>(natural.length)
  const order = natural.map((_, i) => i).sort((a, b) => natural[a] - natural[b])
  let left = Math.max(0, available)
  for (let k = 0; k < order.length; k++) {
    const i = order[k]
    const share = left / (order.length - k)
    if (natural[i] <= share) {
      out[i] = natural[i]
      left -= natural[i]
      continue
    }
    // This list and every taller one share what is left.
    for (const j of order.slice(k)) {
      out[j] = Math.max(
        Math.floor(share),
        Math.min(natural[j], MIN_BODY_HEIGHT),
      )
    }
    break
  }
  return out
}
