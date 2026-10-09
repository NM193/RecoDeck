// src/lib/home/cards.ts
// Home's card catalog and its stored layout (Home cards spec, The grid): 4
// columns, rows of 120px. A card's limits always come from the catalog, never
// from what was stored: react-grid-layout enforces them only while resizing.
import type { LayoutItem } from 'react-grid-layout/legacy'

/** Columns in Home's grid. */
export const HOME_COLUMNS = 4

export type HomeGroup = 'Jump back in' | 'Needs you' | 'Your library' | 'Gig prep'

/** Customize lists the catalog under these, in this order; on Home a card shows no group. */
export const HOME_GROUPS: readonly HomeGroup[] = [
  'Jump back in',
  'Needs you',
  'Your library',
  'Gig prep',
]

export interface HomeCardDef {
  id: string
  title: string
  group: HomeGroup
  /** The size a card is added at, in columns × rows. */
  w: number
  h: number
  minW: number
  minH: number
  maxW: number
  maxH: number
}

/** The catalog. Ids that kept their meaning from the old Home kept their id. */
export const HOME_CARDS: readonly HomeCardDef[] = [
  { id: 'recently-played', title: 'Recently played', group: 'Jump back in', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'recently-added', title: 'Recently added', group: 'Jump back in', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'saved-sets', title: 'Sets you saved lately', group: 'Jump back in', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'your-djs', title: 'Your DJs', group: 'Jump back in', w: 4, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { id: 'needs-you', title: 'Needs you', group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { id: 'new-likes', title: "New likes you don't own", group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'new-sets', title: 'New sets', group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'upcoming-gigs', title: 'Your DJs play next', group: 'Needs you', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'library-stats', title: 'Library stats', group: 'Your library', w: 1, h: 1, minW: 1, minH: 1, maxW: 4, maxH: 1 },
  { id: 'library-by-genre', title: 'Library by genre', group: 'Your library', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'bpm-key', title: 'BPM & key', group: 'Your library', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 2 },
  { id: 'not-analyzed', title: 'Not analyzed', group: 'Your library', w: 1, h: 1, minW: 1, minH: 1, maxW: 2, maxH: 1 },
  { id: 'playlists', title: 'Your playlists', group: 'Gig prep', w: 4, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 3 },
  { id: 'quick-actions', title: 'Quick actions', group: 'Gig prep', w: 2, h: 1, minW: 2, minH: 1, maxW: 4, maxH: 1 },
  { id: 'last-playlist', title: 'Last playlist', group: 'Gig prep', w: 2, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 3 },
]

export function homeCard(id: string): HomeCardDef | undefined {
  return HOME_CARDS.find((card) => card.id === id)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** A card at a place, its size kept within its limits and the grid. */
function place(card: HomeCardDef, x: number, y: number, w: number, h: number): LayoutItem {
  const width = clamp(w, card.minW, card.maxW)
  return {
    i: card.id,
    x: clamp(x, 0, HOME_COLUMNS - width),
    y,
    w: width,
    h: clamp(h, card.minH, card.maxH),
    minW: card.minW,
    minH: card.minH,
    maxW: card.maxW,
    maxH: card.maxH,
  }
}

/** Home on first start, and after Reset: eight cards. */
const DEFAULT_PLACES: ReadonlyArray<[string, number, number, number, number]> = [
  ['needs-you', 0, 0, 2, 2],
  ['recently-played', 2, 0, 2, 2],
  ['upcoming-gigs', 0, 2, 2, 2],
  ['library-by-genre', 2, 2, 2, 2],
  ['playlists', 0, 4, 4, 1],
  ['library-stats', 0, 5, 1, 1],
  ['not-analyzed', 1, 5, 1, 1],
  ['quick-actions', 2, 5, 2, 1],
]

export function defaultLayout(): LayoutItem[] {
  return DEFAULT_PLACES.map(([id, x, y, w, h]) => place(homeCard(id)!, x, y, w, h))
}

/** A card added in Customize: its default size, below the others. */
export function newCardItem(id: string): LayoutItem | null {
  const card = homeCard(id)
  return card ? { ...place(card, 0, 0, card.w, card.h), y: Infinity } : null
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Stored cards fitted to the catalog: unknown or removed ids and repeats are
 * dropped, the limits come from the catalog, and the size is clamped into them.
 */
export function fitToCatalog(items: readonly unknown[]): LayoutItem[] {
  const seen = new Set<string>()
  const layout: LayoutItem[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const { i, x, y, w, h } = item as Record<string, unknown>
    if (typeof i !== 'string' || seen.has(i)) continue
    const card = homeCard(i)
    if (!card || !isNumber(x) || !isNumber(y) || !isNumber(w) || !isNumber(h)) continue
    seen.add(i)
    layout.push(place(card, Math.round(x), Math.max(0, Math.round(y)), Math.round(w), Math.round(h)))
  }
  return layout
}

/** The stored form's version: `{ "version": 2, "layout": [...] }`. */
const LAYOUT_VERSION = 2

/**
 * The layout to show from what is stored. The old form (a bare list) is
 * replaced by the default once, and `rewrite` says to store that at once.
 * Nothing stored, or something unreadable (or a newer version), shows the
 * default and is left as it is.
 */
export function readStoredLayout(json: string | null): { layout: LayoutItem[]; rewrite: boolean } {
  if (!json) return { layout: defaultLayout(), rewrite: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { layout: defaultLayout(), rewrite: false }
  }
  if (Array.isArray(parsed)) return { layout: defaultLayout(), rewrite: true }
  const stored = parsed as { version?: unknown; layout?: unknown } | null
  if (stored?.version === LAYOUT_VERSION && Array.isArray(stored.layout)) {
    return { layout: fitToCatalog(stored.layout), rewrite: false }
  }
  return { layout: defaultLayout(), rewrite: false }
}

/** What Save stores: each card's place and size (its limits come from the catalog). */
export function storedLayoutJson(layout: readonly LayoutItem[]): string {
  return JSON.stringify({
    version: LAYOUT_VERSION,
    layout: layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
  })
}
