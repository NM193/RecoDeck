// src/lib/sidebarPrefs.ts
/**
 * The sidebar's two preferences — whether it is collapsed to icons, and which
 * colour each section's icon takes while it is active — and the rules for both.
 *
 * Pure functions only. `components/layout/useSidebarPrefs.ts` wires them to
 * storage, the window and the keyboard.
 */

/** Below this window width the sidebar collapses; at it or above, it expands. */
export const COLLAPSE_BELOW = 1100

/** Width of the icons-only rail. */
export const COLLAPSED_WIDTH = 60

/** localStorage key, next to the existing `sidebar_width`. Read synchronously, so no flash. */
export const COLLAPSED_KEY = 'sidebar_collapsed'

/** Collapsed state at start-up: the stored choice, but a narrow window always starts collapsed. */
export function initialCollapsed(stored: string | null, windowWidth: number): boolean {
  if (windowWidth < COLLAPSE_BELOW) return true
  return stored === 'true'
}

/**
 * What a window resize does to the collapsed state.
 *
 * Only crossing the line acts. Resizing within one side of it changes nothing,
 * so a manual toggle stands until the next crossing. Returns the new state, or
 * null when there is nothing to change.
 */
export function collapseOnResize(prevWidth: number, nextWidth: number): boolean | null {
  const wasNarrow = prevWidth < COLLAPSE_BELOW
  const isNarrow = nextWidth < COLLAPSE_BELOW
  return wasNarrow === isNarrow ? null : isNarrow
}
