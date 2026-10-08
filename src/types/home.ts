// src/types/home.ts
// What Home's cards read beyond Search's sections (Home cards spec, Data).

/** A gig of a DJ with a page (`get_upcoming_gigs`), for Your DJs play next. */
export interface UpcomingGig {
  nameKey: string
  displayName: string
  /** Resident Advisor's event id. */
  eventId: string
  /** "2026-10-12", the venue's local day. */
  date: string
  venue: string | null
  city: string | null
  /** ISO code. */
  country: string | null
}
