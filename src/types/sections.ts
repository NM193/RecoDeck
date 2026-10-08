// src/types/sections.ts
// What the Search page's sections read before you type (Search spec); Home
// reads them too.
import type { GenreCount, Track } from './track'

/** A track played lately, with its latest play (unix seconds). */
export interface RecentlyPlayedTrack extends Track {
  played_at: number
}

/** A DJ the user knows (`get_known_djs`): one with a DJ page, or watched for sets. */
export interface YourDj {
  nameKey: string
  displayName: string
  /** The Spotify photo, else Resident Advisor's. */
  imageUrl: string | null
  /** The first gig on or after the day asked about ("2026-10-12", the venue's day). */
  nextGig: { date: string; venue: string | null } | null
  watched: boolean
}

/** The library at a glance, for the genre tiles. */
export interface LibraryGroups {
  /** The biggest genres, biggest first (at most 6). */
  genres: GenreCount[]
  /** Tracks added in the last 30 days. */
  addedRecently: number
  /** Tracks with no play in the history. */
  neverPlayed: number
}
