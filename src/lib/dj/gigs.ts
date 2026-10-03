// src/lib/dj/gigs.ts
/**
 * Upcoming and past gigs, worked out from each gig's date when it is read —
 * so a cached gig moves to "past" on its own, with no refresh.
 */
import type { DjGig } from '../../types/dj'

/** "2026-10-03" for the local calendar day of `date`. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Upcoming: today and later, soonest first. Past: before today, latest first.
 * RA's dates are the venue's local day; comparing days, not instants, keeps a
 * gig tonight upcoming all day.
 */
export function splitGigs(
  gigs: DjGig[],
  today: string,
): { upcoming: DjGig[]; past: DjGig[] } {
  const day = (gig: DjGig) => gig.date.slice(0, 10)
  const upcoming = gigs
    .filter((gig) => day(gig) >= today)
    .sort((a, b) => day(a).localeCompare(day(b)))
  const past = gigs
    .filter((gig) => day(gig) < today)
    .sort((a, b) => day(b).localeCompare(day(a)))
  return { upcoming, past }
}

function parseDay(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** The date block of a gig row: { day: "12", month: "Oct" }. */
export function gigDay(date: string): { day: string; month: string } {
  const parsed = parseDay(date)
  if (!parsed) return { day: '', month: '' }
  return {
    day: String(parsed.getDate()).padStart(2, '0'),
    month: parsed.toLocaleDateString('en-US', { month: 'short' }),
  }
}

/** "Sat, Oct 12" — and the year when it is not this one. */
export function gigLabel(date: string, today: string): string {
  const parsed = parseDay(date)
  if (!parsed) return ''
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "Ibiza, ES" — the row's place under the venue; either part may be missing. */
export function gigPlace(gig: DjGig): string {
  return [gig.city, gig.country].filter(Boolean).join(', ')
}

export interface HeroMetaPart {
  lead: string
  /** The number the line is about, shown bold as in the mockup. */
  bold: string
  tail: string
}

/** The hero's meta line, parts with no data left out, each split around its bold words. */
export function heroMetaParts(facts: {
  owned: number | null
  tracks: number | null
  sets: number
  nextGig: string | null
}): HeroMetaPart[] {
  const parts: HeroMetaPart[] = []
  if (facts.owned !== null && facts.tracks !== null && facts.tracks > 0) {
    parts.push({
      lead: '',
      bold: `You own ${facts.owned}`,
      tail: ` of ${facts.tracks} tracks`,
    })
  }
  if (facts.sets > 0) {
    parts.push({
      lead: '',
      bold: `${facts.sets} ${facts.sets === 1 ? 'set' : 'sets'}`,
      tail: ' saved',
    })
  }
  if (facts.nextGig)
    parts.push({ lead: 'next gig ', bold: facts.nextGig, tail: '' })
  return parts
}

/** The hero's meta line as plain text, parts with no data left out. */
export function heroMeta(facts: Parameters<typeof heroMetaParts>[0]): string[] {
  return heroMetaParts(facts).map((part) => part.lead + part.bold + part.tail)
}
