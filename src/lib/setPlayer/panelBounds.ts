// src/lib/setPlayer/panelBounds.ts
// Where the set's video panel goes (Sets redesign spec, Where the panel
// sits). The panel is a native webview laid over the page: it cannot scroll
// and draws above everything, so it follows a box — the playing set's page
// box while that is mounted, else the bar's — and waits off the window,
// still playing, while a menu, popover or modal is open.

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Off the window, where the panel waits while it may not be seen. */
export const OFFSCREEN = -10000

/** The box the panel belongs in: the set page's while it is mounted, else the bar's. */
export function panelBox<T>(pageBox: T | null, barBox: T | null): T | null {
  return pageBox ?? barBox
}

/** The bar shows while a set plays and its page box is not mounted. */
export function barShows(playing: boolean, pageBoxMounted: boolean): boolean {
  return playing && !pageBoxMounted
}

/** The size the panel keeps off the window when it has no box to measure. */
const RESTING = { width: 320, height: 180 }

/**
 * The panel's bounds for its box's rectangle: the box itself, or off the
 * window — keeping its size, so the video does not reflow — while an overlay
 * is open or there is no box to sit in.
 */
export function panelBounds(
  rect: { left: number; top: number; width: number; height: number } | null,
  overlayOpen: boolean,
): Bounds {
  if (!rect || rect.width <= 0 || rect.height <= 0 || overlayOpen) {
    return {
      x: OFFSCREEN,
      y: OFFSCREEN,
      width: rect && rect.width > 0 ? Math.round(rect.width) : RESTING.width,
      height: rect && rect.height > 0 ? Math.round(rect.height) : RESTING.height,
    }
  }
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

export function sameBounds(a: Bounds | null, b: Bounds): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
