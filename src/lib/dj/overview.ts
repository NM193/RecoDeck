// src/lib/dj/overview.ts
/**
 * The Overview tab's cards: which are shown, in what order, and where each
 * sits. One layout for every DJ page.
 *
 * Only the order of card ids is stored (`dj_overview_layout` in settings),
 * never grid coordinates. The grid is rebuilt from the order by packing it
 * into two columns, so a stored layout can never be broken by a card that
 * changed width or disappeared.
 */

export type DjTab = 'overview' | 'tracks' | 'plays' | 'sets' | 'gigs'

export type OverviewCardId =
  | 'upcoming-gigs'
  | 'plays'
  | 'tracks'
  | 'sets'
  | 'photos'
  | 'past-gigs'
  | 'missing'

export interface OverviewCard {
  id: OverviewCardId
  title: string
  /** Half a row, or a whole row. Fixed per card: there is no resizing. */
  width: 'half' | 'full'
  /** Where the card's title leads. */
  tab: DjTab
}

/** Every card, in the order the "+ Card" pills list them. */
export const OVERVIEW_CARDS: OverviewCard[] = [
  { id: 'upcoming-gigs', title: 'Upcoming gigs', width: 'half', tab: 'gigs' },
  { id: 'plays', title: 'What they play', width: 'half', tab: 'plays' },
  { id: 'tracks', title: 'Tracks & remixes', width: 'full', tab: 'tracks' },
  { id: 'sets', title: 'Latest sets', width: 'full', tab: 'sets' },
  { id: 'photos', title: 'Photos', width: 'half', tab: 'overview' },
  { id: 'past-gigs', title: 'Past gigs', width: 'half', tab: 'gigs' },
  { id: 'missing', title: 'Missing tracks', width: 'full', tab: 'tracks' },
]

export const DEFAULT_OVERVIEW: OverviewCardId[] = [
  'upcoming-gigs',
  'plays',
  'tracks',
]

/** The settings key. */
export const OVERVIEW_SETTING = 'dj_overview_layout'

const BY_ID = new Map(OVERVIEW_CARDS.map((card) => [card.id, card]))

export function overviewCard(id: OverviewCardId): OverviewCard {
  return BY_ID.get(id)!
}

function isCardId(value: unknown): value is OverviewCardId {
  return typeof value === 'string' && BY_ID.has(value as OverviewCardId)
}

/**
 * The stored order. Unknown ids are ignored and repeats dropped. Anything
 * that is not a list of strings — or a non-empty list with no card left in it
 * — is the default. An empty list is kept: every card was removed on purpose.
 */
export function parseOverview(raw: string | null): OverviewCardId[] {
  if (!raw) return [...DEFAULT_OVERVIEW]
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return [...DEFAULT_OVERVIEW]
  }
  if (!Array.isArray(data) || !data.every((item) => typeof item === 'string')) {
    return [...DEFAULT_OVERVIEW]
  }
  const ids = [...new Set(data.filter(isCardId))]
  if (data.length > 0 && ids.length === 0) return [...DEFAULT_OVERVIEW]
  return ids
}

export function serializeOverview(ids: OverviewCardId[]): string {
  return JSON.stringify(ids)
}

export interface GridItem {
  i: OverviewCardId
  x: number
  y: number
  w: number
  h: number
}

/**
 * Two columns, in order. A half card takes the next free half; a full card
 * starts a new row and takes all of it. A half card before a full one keeps
 * its row to itself — the same as CSS grid's sparse auto-placement.
 */
export function packOverview(ids: OverviewCardId[]): GridItem[] {
  const items: GridItem[] = []
  let x = 0
  let y = 0
  for (const id of ids) {
    if (overviewCard(id).width === 'full') {
      if (x !== 0) y += 1
      items.push({ i: id, x: 0, y, w: 2, h: 1 })
      x = 0
      y += 1
    } else {
      items.push({ i: id, x, y, w: 1, h: 1 })
      if (x === 0) {
        x = 1
      } else {
        x = 0
        y += 1
      }
    }
  }
  return items
}

/** The order read off a grid after dragging: top to bottom, then left to right. */
export function orderFromGrid(
  items: { i: string; x: number; y: number }[],
): OverviewCardId[] {
  return [...items]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item) => item.i)
    .filter(isCardId)
}

/** The cards not on the overview: the "+ Card" pills. */
export function hiddenCards(ids: OverviewCardId[]): OverviewCard[] {
  const shown = new Set(ids)
  return OVERVIEW_CARDS.filter((card) => !shown.has(card.id))
}
