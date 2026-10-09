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

/** A set a watched DJ's search found that has not been seen, under the DJ whose search found it first. */
export interface NewDjFind {
  videoId: string
  nameKey: string
  /** The DJ's name as watched. */
  displayName: string
  title: string
  channel: string | null
  /** In the library: it opens at no cost; else opening it fetches it (5–7 units). */
  saved: boolean
}

/** New sets (`get_new_dj_finds`): the newest unseen finds, and how many videos are unseen in all. */
export interface NewDjFinds {
  total: number
  finds: NewDjFind[]
}

/** One find row: what Mark all seen changed, and what its Undo puts back. */
export interface DjFindKey {
  nameKey: string
  videoId: string
}
