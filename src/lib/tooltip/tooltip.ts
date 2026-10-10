// src/lib/tooltip/tooltip.ts
// The tooltips' timing and placement (Micro-interactions spec, Tooltips):
// pure, so TooltipLayer only wires them to the DOM.

/** The first tooltip shows after the pointer has rested this long. */
export const TIP_DELAY_MS = 200
/** For this long after one hides, the next shows at once. */
export const TIP_WARM_MS = 400
/** Leaving an element, the tip waits this long for the next one, so it can glide there. */
export const TIP_LEAVE_MS = 80
/** Between the element and its tip. */
export const TIP_GAP = 6
/** The tip stays this far inside the window. */
export const TIP_MARGIN = 8

/** Where a tip asks to go; `left` only as the flip of `right`. */
export type TipSide = 'top' | 'right' | 'bottom' | 'left'

const OPPOSITE: Record<TipSide, TipSide> = {
  top: 'bottom',
  bottom: 'top',
  right: 'left',
  left: 'right',
}

/** How the next tip comes in: gliding from the one shown, at once while warm, or after the delay. */
export function tipEntry(
  visible: boolean,
  msSinceHidden: number,
): 'glide' | 'now' | 'wait' {
  if (visible) return 'glide'
  return msSinceHidden < TIP_WARM_MS ? 'now' : 'wait'
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Placement {
  left: number
  top: number
  side: TipSide
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Where a tip of `size` goes for an element at `anchor`: on `side`, centred
 * on the element, `TIP_GAP` away; on the opposite side when it does not fit
 * and that one does; kept `TIP_MARGIN` inside the window along the other axis.
 */
export function placeTip(
  anchor: Box,
  size: { width: number; height: number },
  side: TipSide,
  viewport: { width: number; height: number },
): Placement {
  const fits = (s: TipSide) => {
    if (s === 'top') return anchor.top - TIP_GAP - size.height >= TIP_MARGIN
    if (s === 'bottom')
      return (
        anchor.top + anchor.height + TIP_GAP + size.height <=
        viewport.height - TIP_MARGIN
      )
    if (s === 'right')
      return (
        anchor.left + anchor.width + TIP_GAP + size.width <=
        viewport.width - TIP_MARGIN
      )
    return anchor.left - TIP_GAP - size.width >= TIP_MARGIN
  }
  const chosen = fits(side) || !fits(OPPOSITE[side]) ? side : OPPOSITE[side]

  if (chosen === 'top' || chosen === 'bottom') {
    return {
      side: chosen,
      left: clamp(
        anchor.left + anchor.width / 2 - size.width / 2,
        TIP_MARGIN,
        viewport.width - TIP_MARGIN - size.width,
      ),
      top:
        chosen === 'top'
          ? anchor.top - TIP_GAP - size.height
          : anchor.top + anchor.height + TIP_GAP,
    }
  }
  return {
    side: chosen,
    left:
      chosen === 'right'
        ? anchor.left + anchor.width + TIP_GAP
        : anchor.left - TIP_GAP - size.width,
    top: clamp(
      anchor.top + anchor.height / 2 - size.height / 2,
      TIP_MARGIN,
      viewport.height - TIP_MARGIN - size.height,
    ),
  }
}
