/**
 * The sidebar's two preferences — whether it is collapsed to icons, and which
 * colour each section's icon takes while it is active — and the rules for both.
 *
 * Pure functions only. `components/layout/useSidebarPrefs.ts` wires them to
 * storage, the window and the keyboard.
 */

/** Below this window width the sidebar is forced collapsed; crossing back above it expands. */
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

/** settings-table key holding the colour overrides, as JSON: section → hex. */
export const COLOURS_KEY = 'sidebar_colours'

export type SidebarSection =
  | 'home'
  | 'sets'
  | 'all-tracks'
  | 'search'
  | 'ai-chat'
  | 'folders'
  | 'playlists'
  | 'spotify'

/** The views App.tsx can be showing. */
export type ActiveView =
  | 'home'
  | 'all-tracks'
  | 'folder'
  | 'playlist'
  | 'settings'
  | 'search'
  | 'ai-chat'
  | 'sets'

export type ColourOverrides = Partial<Record<SidebarSection, string>>

export const DEFAULT_COLOURS: Record<SidebarSection, string> = {
  home: '#60a5fa',
  sets: '#fb923c',
  'all-tracks': '#818cf8',
  search: '#2dd4bf',
  'ai-chat': '#818cf8',
  folders: '#a78bfa',
  playlists: '#f472b6',
  spotify: '#1ed760',
}

/** The right-click menu's swatches: every default, plus yellow. */
export const PALETTE = [
  '#60a5fa',
  '#fb923c',
  '#818cf8',
  '#2dd4bf',
  '#a78bfa',
  '#f472b6',
  '#1ed760',
  '#facc15',
] as const

const HEX = /^#[0-9a-f]{6}$/i

/** Stored overrides. Unknown sections and invalid colours are dropped, never thrown. */
export function parseColours(raw: string | null): ColourOverrides {
  if (!raw) return {}
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}

  const overrides: ColourOverrides = {}
  for (const [key, value] of Object.entries(data)) {
    const known = Object.prototype.hasOwnProperty.call(DEFAULT_COLOURS, key)
    if (known && typeof value === 'string' && HEX.test(value)) {
      overrides[key as SidebarSection] = value.toLowerCase()
    }
  }
  return overrides
}

export function colourFor(section: SidebarSection, overrides: ColourOverrides): string {
  return overrides[section] ?? DEFAULT_COLOURS[section]
}

/** The section whose icon is lit while a view is showing. Settings lights nothing. */
export function sectionForView(view: ActiveView): SidebarSection | null {
  switch (view) {
    case 'folder':
      return 'folders'
    case 'playlist':
      return 'playlists'
    case 'settings':
      return null
    default:
      return view
  }
}
