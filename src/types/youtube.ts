/** Local estimate of YouTube quota use — YouTube itself reports nothing. */
export interface YouTubeQuotaStatus {
  spent: number
  remaining: number
  daily_limit: number
  /** Quota buckets by Pacific day, not local day. */
  pacific_day: string
  seconds_until_reset: number
  exhausted: boolean
}

/**
 * One fetched set. camelCase because this is the exact shape the standalone
 * tool writes into `fixtures/`, which the ported parser reads verbatim.
 */
export interface RawSetComment {
  author: string
  text: string
  likeCount: number
  /** Present on replies: the author of the comment being answered. */
  replyTo?: string
}

export interface RawSetVideo {
  id: string
  url: string
  title: string
  channel: string
  publishedAt: string
  description: string
  durationMs: number
}

export interface RawSet {
  video: RawSetVideo
  comments: RawSetComment[]
  fetchedAt: string
}

/** A processed set, as listed in the library. Reopening one costs no quota. */
export interface YtSetSummary {
  video_id: string
  url: string
  title: string
  channel?: string
  published_at?: string
  duration_ms?: number
  fetched_at?: string
  status?: string
  confidence?: number
  source_count?: number
  track_count?: number
  added_at?: string
}

/** A track hearted out of a set. */
export interface SavedTrack {
  id?: number
  video_id: string
  cue_ms: number
  cue?: string
  artist?: string
  title: string
  mix?: string
  saved_at?: string
  set_title?: string
}
