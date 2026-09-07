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
