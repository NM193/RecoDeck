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

/** A hit from searching across every stored set. */
export interface YtTrackHit {
  video_id: string
  set_title?: string
  cue_ms: number
  cue?: string
  artist?: string
  title: string
  mix?: string
}

export interface YtStats {
  sets: number
  tracks: number
  unknowns: number
  /** [artist, how many times they turn up] */
  top_artists: [string, number][]
  /** [title, artist, in how many different sets] */
  shared_tracks: [string, string | null, number][]
  /** [video id, set title, unnamed slots] */
  most_unknowns: [string, string, number][]
  quota: YouTubeQuotaStatus
}

/** A set found by searching YouTube by name, before anything is fetched. */
export interface SetSearchHit {
  videoId: string
  title: string
  channel: string
  publishedAt: string
  thumbnail?: string
}

/** A channel resolved to something the API can work with. */
export interface ChannelInfo {
  channelId: string
  title: string
  uploadsId: string
  handle?: string
}

export interface FollowedChannel {
  channel_id: string
  handle?: string
  title?: string
  uploads_id?: string
  last_checked?: string
  last_seen_video?: string
}

/** One long upload of a channel, before anything is fetched about it. */
export interface ChannelUpload {
  video_id: string
  title: string
  published_at: string
  duration_ms?: number
  already_stored: boolean
}

export interface ChannelNews {
  channel_id: string
  title?: string
  new_sets: ChannelUpload[]
}
