// src/lib/search/labels.ts
// The small lines under Search's tiles and rows (Search spec, Sections).
import { gigLabel } from '../dj/gigs'
import { parseUtcDate } from '../trackTable/filter'
import type { YourDj } from '../../types/sections'

const DAY_MS = 24 * 60 * 60 * 1000

/** A Your DJs card's one line: the next gig, else "watching for sets" when watched, else nothing. */
export function djLine(
  dj: Pick<YourDj, 'nextGig' | 'watched'>,
  today: string,
): string {
  if (dj.nextGig) return `next gig ${gigLabel(dj.nextGig.date, today)}`
  return dj.watched ? 'watching for sets' : ''
}

/** "1 track", "1,581 tracks". */
export function trackCount(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'track' : 'tracks'}`
}

/** A DJ without a photo: the no-photo gradient, turned to a hue of its own per name. */
export function djHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return Math.abs(hash) % 360
}

/** "JC" for Joseph Capriati, "T" for Traumer: the first letters of the first two words. */
export function djInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join('')
    .toUpperCase()
}

/**
 * When something was added, by the local day: "today", "yesterday", "3 days
 * ago", then "Sep 12" (with the year when it is not this one). `stored` is
 * SQLite's UTC "2026-10-03 21:14:05". Empty when it cannot be read.
 */
export function daysAgoLabel(stored: string | undefined, now: Date): string {
  const time = parseUtcDate(stored)
  if (time === null) return ''
  const then = new Date(time)
  const dayOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  // Rounded: a day across a clock change is 23 or 25 hours.
  const days = Math.round((dayOf(now) - dayOf(then)) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}
