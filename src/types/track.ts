// Track types matching Rust backend DTOs

export interface Track {
  id: number
  file_path: string
  file_hash: string
  title?: string
  artist?: string
  album?: string
  album_artist?: string
  track_number?: number
  year?: number
  label?: string
  duration_ms?: number
  file_format?: string
  bitrate?: number
  sample_rate?: number
  file_size?: number
  date_added?: string
  date_modified?: string
  play_count: number
  rating: number
  comment?: string
  artwork_path?: string
  genre?: string
  genre_source?: string // 'user' | 'tag' | 'ai'
  // Analysis fields (from track_analysis table via LEFT JOIN)
  bpm?: number
  bpm_confidence?: number
  musical_key?: string
  key_confidence?: number
}

/** A folder of the library, for Move to folder ▸: its path as tracks store it. */
export interface LibraryFolder {
  path: string
  /** "Music / House / Deep" */
  label: string
}

/** Why Move to folder left a track where it was. */
export type MoveSkipReason = 'already_there' | 'name_taken' | 'missing' | 'failed'

export interface MoveReport {
  moved: Array<{ id: number; newPath: string }>
  skipped: Array<{ id: number; reason: MoveSkipReason }>
}

/** A track's genre and its source, as the Undo of a genre change puts them back. */
export interface TrackGenre {
  id: number
  genre: string | null
  source: string | null
}

export interface ScanResult {
  total_files: number
  imported: number
  skipped: number
  /** Tracks whose file was gone, now pointing at the moved file. */
  relinked: number
  errors: ScanError[]
}

export interface ScanError {
  file_path: string
  error: string
}

// Folder tree types
export interface FolderInfo {
  name: string
  path: string
  track_count: number
  has_subfolders: boolean
}

// Playlist types
export interface Playlist {
  id: number
  name: string
  playlist_type: string // "manual" | "smart" | "folder"
  parent_id: number | null
  track_count: number
  created_at?: string
  updated_at?: string
  /** Its own cover image (Change cover); read with tauriApi.getPlaylistCover. */
  cover_path?: string | null
}

// Analysis result types
export interface BpmResult {
  track_id: number
  bpm: number
  confidence: number
}

export interface KeyResult {
  track_id: number
  camelot: string
  open_key: string
  musical_key: string
  confidence: number
}

export interface TrackAnalysis {
  track_id: number
  bpm?: number
  bpm_confidence?: number
  musical_key?: string
  key_confidence?: number
  loudness_lufs?: number
  dynamic_range?: number
  spectral_centroid?: number
  analyzed_at?: string
}

// Genre types
export interface GenreCount {
  genre: string
  count: number
}

export interface GenreDefinition {
  id: number
  name: string
  color?: string
  sort_order: number
}

// Batch analysis event types (emitted by backend during parallel analysis)
export interface AnalysisProgressEvent {
  current: number
  total: number
  track_id: number
  track_name: string
  bpm?: number
  musical_key?: string
}

export interface AnalysisCompleteEvent {
  total_analyzed: number
  total_requested: number
  total_failed: number
  cancelled: boolean
}

// Duplicate-track detection
export type DuplicateReason =
  | 'identical_content'
  | 'identical_filename_size'
  | 'same_title_artist'

export interface PlaylistRef {
  id: number
  name: string
}

/** One copy in a duplicate group: the track plus what the modal shows about it. */
export interface DuplicateTrack extends Track {
  playlists: PlaylistRef[]
  /** Has BPM or key (a waveform-only analysis does not count). */
  analyzed: boolean
  /** Rows in the play history. */
  plays: number
  /** The file is not on disk (a stale row, e.g. its folder was moved). */
  file_missing: boolean
}

export interface DuplicateGroup {
  detection_reason: DuplicateReason
  /** The copy the backend suggests keeping, and why. */
  recommended_keep_id: number
  recommend_reason: string
  /** Sorted by id ASC. */
  tracks: DuplicateTrack[]
}

/** One group to merge: `keep_id` stays, `remove_ids` merge into it. */
export interface MergeRequest {
  keep_id: number
  remove_ids: number[]
}

export interface MergeSummary {
  merged: number
  playlist_slots_moved: number
  trashed: number
  /** Paths that could not go to the Trash. */
  trash_failed: string[]
}

// Missing files (spec 2026-10-15)

/** A file that might be a missing track's file. */
export interface MissingCandidate {
  path: string
  duration_ms: number | null
  file_size: number | null
  /** Set when the file already is a library track: the row offers Merge into it. */
  library_track_id: number | null
}

/** A track whose file is gone, with what the review shows about it. */
export interface MissingTrack extends Track {
  playlists: PlaylistRef[]
  /** Has BPM or key. */
  analyzed: boolean
  /** Rows in the play history. */
  plays: number
  /** The unplugged drive its file was on. */
  drive_missing: string | null
  /** Same-name files in the library folders, ordered by path. */
  candidates: MissingCandidate[]
}

export interface MissingFixes {
  relinks: { track_id: number; path: string }[]
  merges: { keep_id: number; remove_id: number }[]
  removes: number[]
}

export interface MissingFixSummary {
  relinked: number
  merged: number
  removed: number
  skipped: { track_id: number; reason: string }[]
}
