/**
 * Types for the tracklist parser ported from the standalone yt-tracklist tool.
 *
 * The shapes mirror the tool's output exactly, because its saved fixtures are
 * the regression suite: if a field is renamed here, the comparison against the
 * original stops meaning anything.
 */

/** A video as the fetch layer hands it over — matches the fixture shape. */
export interface SetVideo {
  id: string
  url: string
  title: string
  channel: string
  publishedAt: string
  description: string
  durationMs: number
}

export interface SetComment {
  author: string
  text: string
  likeCount: number
  /** Present on replies: the author of the comment being answered. */
  replyTo?: string
}

export interface RawSet {
  video: SetVideo
  comments: SetComment[]
  fetchedAt: string
}

/** What one "Artist - Title (Remix) [Label]" string breaks down into. */
export interface ParsedName {
  artist: string | null
  title: string
  mix: string | null
  label: string | null
  note: string | null
  /** The person who wrote it was not sure — a "(?)" or trailing "?". */
  uncertain: boolean
  /** The slot exists but nobody named it: "ID", "?", "unreleased". */
  isUnknown: boolean
}

/** A row taken straight out of one block of text, before any merging. */
export interface ExtractedTrack extends ParsedName {
  index: number
  cue: string
  cueMs: number
  artistNorm: string | null
  titleNorm: string | null
  raw: string
}

export interface Disagreement {
  artist: string | null
  title: string
  mix: string | null
  votes: number
}

/** A guess for an unnamed slot, built from the comments around it. */
export interface Suggestion {
  artist: string | null
  title: string
  label: string | null
  author: string
  votes: number
  likeCount: number
  /** Someone put it within five seconds of the slot, not just nearby. */
  exact: boolean
  score: number
}

/** A row in the finished tracklist. */
export interface Track {
  index: number
  cue: string
  cueMs: number
  artist: string | null
  title: string
  mix: string | null
  label: string | null
  note: string | null
  uncertain: boolean
  isUnknown: boolean
  artistNorm: string | null
  titleNorm: string | null
  /** How many sources named it this way. */
  votes: number
  /** How many sources listed this slot at all. */
  listed: number
  /** How many tracklists were found for the set in total. */
  sourceCount: number
  /** Runner-up readings, so "or: ..." can be shown under the winner. */
  disagree: Disagreement[]

  // Only on tracks assembled from scattered comments:
  fromComments?: boolean
  author?: string
  likeCount?: number
  /** How many people asked for this ID without an answer. */
  asks?: number

  // Filled in for unknown slots:
  suggestions?: Suggestion[]
}

/** A name mentioned in the comments with no timestamp anywhere near it. */
export interface LooseName {
  key: string | null
  artist: string | null
  title: string
  mix: string | null
  author: string
  likeCount: number
}

export interface CandidateSourceMeta {
  author: string
  likeCount: number
}

/** One block of text that parsed as a tracklist. */
export interface Candidate {
  source: 'description' | 'comment'
  sourceMeta: CandidateSourceMeta | null
  weight: number
  tracks: ExtractedTrack[]
  confidence: number
}

export type TracklistStatus =
  | 'ok'
  | 'assembled'
  | 'low_confidence'
  | 'no_tracklist'

export interface TracklistResult {
  video: Omit<SetVideo, 'description'>
  status: TracklistStatus
  source: 'description' | 'comment' | null
  sourceMeta: CandidateSourceMeta | null
  confidence: number
  sourceCount: number
  trackCount: number
  tracks: Track[]
  loose: LooseName[]
}
