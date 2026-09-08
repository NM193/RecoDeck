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
  /**
   * The full description, fetched for one unit across the whole page of hits.
   * Enough to say which of them carries a tracklist before spending 5-7 on one.
   */
  description?: string
  durationMs?: number
  commentCount?: number
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
  /** How often the app checks on its own: 0 never, 24 daily, 168 weekly. */
  check_interval_hours: number
}

/** The intervals offered per channel, and what each costs to run. */
export const CHECK_INTERVALS = [
  { hours: 0, label: 'Never' },
  { hours: 24, label: 'Daily' },
  { hours: 168, label: 'Weekly' },
] as const

/** One long upload of a channel, before anything is fetched about it. */
export interface ChannelUpload {
  video_id: string
  title: string
  published_at: string
  duration_ms?: number
  already_stored: boolean
}

export interface ChannelNews {
  /** A channel's UC id, or `dj:<name>` for a watched DJ. */
  channel_id: string
  title?: string
  /** Where the news came from — only a channel has a last-seen marker to move. */
  source: 'channel' | 'dj'
  /** The user asked for these to be fetched and stored without being asked. */
  auto_import: boolean
  new_sets: ChannelUpload[]
}

/**
 * A DJ watched for new sets, wherever they turn up.
 *
 * Separate from a followed channel because the mechanism differs, not just the
 * name: a channel's uploads are a listing at a unit or two, while a DJ has to
 * be searched for at a hundred.
 */
export interface WatchedDj {
  name_key: string
  display_name: string
  check_interval_hours: number
  last_checked?: string
  /** Fetch and store what a search turns up. Off unless switched on. */
  auto_import: boolean
}

/**
 * Where the in-window video is, as the panel last reported it.
 *
 * The panel is a webview of its own, so this is the only view into it: the app
 * can tell it what to do, and this is what comes back.
 */
export interface YouTubePanelState {
  position_ms: number
  duration_ms: number
  /** YouTube's numbering: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
  player_state: number
}

/** The panel is playing, as opposed to paused, buffering or not started. */
export const YT_PLAYING = 1

/**
 * The same record, found in another set that knows where it sits.
 *
 * A tracklist with no timestamps says what was played and not when — but the
 * same record often appears in a set that was written out properly, and that
 * one does know. A row with nowhere to go can point there instead.
 */
export interface TrackEcho {
  /** Position in the set being looked at. */
  position: number
  video_id: string
  set_title?: string
  cue_ms: number
  cue?: string
}
