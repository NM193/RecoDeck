// src/lib/dj/page.ts
/**
 * The DJ page's small decisions, kept out of the components so they are
 * tested: what a refresh's answer means for the page, what the Gigs tab shows,
 * the tab row's numbers, and how a set card and the outside links read.
 */
import type { DjTab } from './overview'
import type {
  ArtistCandidate,
  DjRefresh,
  RaPick,
  RefreshOutcome,
} from '../../types/dj'
import type { YtSetSummary } from '../../types/youtube'

/** Where one source (Spotify or RA) stands while the page is open. */
export interface DjSourceStatus {
  /** Its refresh is running. */
  refreshing: boolean
  /** The last refresh's answer; null until one has answered. */
  outcome: RefreshOutcome | null
  error: string | null
}

/** A page opens with both refreshes under way. */
export const REFRESHING: DjSourceStatus = {
  refreshing: true,
  outcome: null,
  error: null,
}

export function sourceAfter(result: DjRefresh): DjSourceStatus {
  return { refreshing: false, outcome: result.outcome, error: result.error }
}

/** "couldn't refresh": the fetch failed and the cache is as it was. */
export function refreshFailed(status: DjSourceStatus): boolean {
  return !status.refreshing && status.outcome === 'failed'
}

/**
 * What the Gigs tab (and the overview's gig cards) show.
 * - `list`: cached gigs — also after a failed refresh, which keeps them.
 * - `searching`: RA is being asked and nothing is cached yet.
 * - `link`: RA failed or has no such artist, and nothing is cached: only
 *   "Gigs on Resident Advisor ↗" (design decision 8).
 * - `none`: RA answered, with no gigs.
 */
export type GigsState = 'list' | 'searching' | 'link' | 'none'

export function gigsState(ra: DjSourceStatus, cachedGigs: number): GigsState {
  if (cachedGigs > 0) return 'list'
  if (ra.refreshing) return 'searching'
  if (ra.outcome === 'failed' || ra.outcome === 'notFound') return 'link'
  return 'none'
}

export interface DjTabItem {
  id: DjTab
  label: string
  /** The small grey number; null for Overview, and while unknown or zero. */
  count: number | null
}

const TAB_LABELS: [DjTab, string][] = [
  ['overview', 'Overview'],
  ['tracks', 'Tracks'],
  ['plays', 'Plays'],
  ['sets', 'Sets'],
  ['gigs', 'Gigs'],
]

/** The tab row. Gigs counts the upcoming gigs ("all 9 →"). */
export function djTabs(
  counts: Record<Exclude<DjTab, 'overview'>, number | null>,
): DjTabItem[] {
  return TAB_LABELS.map(([id, label]) => {
    const count = id === 'overview' ? null : counts[id]
    return { id, label, count: count !== null && count > 0 ? count : null }
  })
}

/** A set card's second line: "1 h 52 min · 24 tracks"; parts with no data left out. */
export function setMeta(
  set: Pick<YtSetSummary, 'duration_ms' | 'track_count'>,
): string {
  const parts: string[] = []
  if (set.duration_ms) {
    const minutes = Math.round(set.duration_ms / 60_000)
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (hours === 0) parts.push(`${rest} min`)
    else parts.push(rest === 0 ? `${hours} h` : `${hours} h ${rest} min`)
  }
  if (set.track_count)
    parts.push(
      `${set.track_count} ${set.track_count === 1 ? 'track' : 'tracks'}`,
    )
  return parts.join(' · ')
}

/**
 * The set's YouTube thumbnail. A saved set stores no image, but every one is
 * a YouTube video and its thumbnail lives at a fixed address (the CSP allows i.ytimg.com).
 */
export function setThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

export function spotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`
}

/** An RA "Not this artist?" choice as `setDjRaArtist` takes it; null when RA gave no slug. */
export function raPick(candidate: ArtistCandidate): RaPick | null {
  if (!candidate.slug) return null
  return {
    id: candidate.id,
    slug: candidate.slug,
    imageUrl: candidate.imageUrl,
  }
}
