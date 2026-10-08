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

/** The playlist played from most recently (`get_last_played_playlist`), for Last playlist. */
export interface LastPlayedPlaylist {
  playlistId: number
  name: string
  /** That play's time, unix seconds. */
  playedAt: number
}

/** The tracks whose BPM is in `min <= bpm < max`; a missing bound is open. */
export interface BpmRangeCount {
  min: number | null
  max: number | null
  count: number
}

/** BPM & key (`get_bpm_key_counts`): every BPM range, lowest first, and each key, biggest first. */
export interface BpmKeyCounts {
  bpm: BpmRangeCount[]
  keys: Array<{ key: string; count: number }>
}
