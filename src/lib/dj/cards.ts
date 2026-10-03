// src/lib/dj/cards.ts
/**
 * The overview cards' small decisions, kept out of the components so they are
 * tested: what a card title's "all 9 →" says and where it leads, where a card
 * sits in the normal grid, adding and removing cards while customizing, a gig
 * lineup's names (each one a link), and the Photos card's pictures.
 */
import {
  overviewCard,
  type DjTab,
  type GridItem,
  type OverviewCardId,
} from './overview'
import { TRACK_FILTERS } from './tabs'
import type { StatusFilter } from '../spotify/rows'
import type { DjProfile } from '../../types/dj'

/** How many rows each card shows (spec: next 3, top 4, newest 3, 3 sets, last 3, newest 5 Missing). */
export const CARD_ROWS = {
  'upcoming-gigs': 3,
  plays: 4,
  sets: 3,
  'past-gigs': 3,
  missing: 5,
} as const

/** The Tracks card's chips: the mockup's All / Missing / Owned (the tab has Maybe too). */
export const CARD_TRACK_FILTERS = TRACK_FILTERS.filter(
  (filter) => filter.key !== 'maybe',
)

/** What the tabs behind the cards hold; null while unknown. */
export interface OverviewCounts {
  upcoming: number | null
  past: number | null
  /** The DJ's saved sets: the Sets card, and the N of "from your N sets". */
  sets: number | null
  tracks: number | null
  missing: number | null
}

/** "all 9 →" after a card's title; null for Photos, and while the number is unknown or zero. */
export function cardMore(
  id: OverviewCardId,
  counts: OverviewCounts,
): string | null {
  const all = (n: number | null, what = '') => (n ? `all ${n}${what} →` : null)
  switch (id) {
    case 'upcoming-gigs':
      return all(counts.upcoming)
    case 'past-gigs':
      return all(counts.past)
    case 'plays':
      return counts.sets
        ? `from your ${counts.sets} ${counts.sets === 1 ? 'set' : 'sets'} →`
        : null
    case 'tracks':
      return all(counts.tracks)
    case 'sets':
      return all(counts.sets)
    case 'missing':
      return all(counts.missing, ' missing')
    case 'photos':
      return null
  }
}

/** Where a card's title leads: its tab, and for Missing the Tracks tab on its Missing chip. Null for Photos. */
export function cardTarget(
  id: OverviewCardId,
): { tab: DjTab; filter: StatusFilter } | null {
  const { tab } = overviewCard(id)
  if (tab === 'overview') return null
  return { tab, filter: id === 'missing' ? 'missing' : 'all' }
}

/** A packed card (packOverview) as CSS grid lines: a full card spans both columns. */
export function cardPlacement(item: GridItem): {
  gridColumn: string
  gridRow: string
} {
  return {
    gridColumn: item.w === 2 ? '1 / span 2' : String(item.x + 1),
    gridRow: String(item.y + 1),
  }
}

/** "+ Card": appended at the end, never twice. */
export function addCard(
  ids: OverviewCardId[],
  id: OverviewCardId,
): OverviewCardId[] {
  return ids.includes(id) ? ids : [...ids, id]
}

/** "×": the others keep their order. */
export function removeCard(
  ids: OverviewCardId[],
  id: OverviewCardId,
): OverviewCardId[] {
  return ids.filter((other) => other !== id)
}

/** A gig's lineup as RA lists it ("Marco Carola, Loco Dice") → one name per DJ page link. */
export function lineupNames(lineup: string | null): string[] {
  if (!lineup) return []
  return lineup
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

export interface DjPhoto {
  url: string
  source: 'Spotify' | 'Resident Advisor'
}

/** The Photos card: the Spotify artist photo, then the RA one; none twice. */
export function djPhotos(
  profile: Pick<DjProfile, 'spotifyImageUrl' | 'raImageUrl'> | null,
): DjPhoto[] {
  if (!profile) return []
  const photos: DjPhoto[] = []
  if (profile.spotifyImageUrl)
    photos.push({ url: profile.spotifyImageUrl, source: 'Spotify' })
  if (profile.raImageUrl && profile.raImageUrl !== profile.spotifyImageUrl) {
    photos.push({ url: profile.raImageUrl, source: 'Resident Advisor' })
  }
  return photos
}
