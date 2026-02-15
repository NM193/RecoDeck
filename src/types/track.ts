// Track types matching Rust backend DTOs

export interface Track {
  id: number;
  file_path: string;
  file_hash: string;
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  track_number?: number;
  year?: number;
  label?: string;
  duration_ms?: number;
  file_format?: string;
  bitrate?: number;
  sample_rate?: number;
  file_size?: number;
  date_added?: string;
  date_modified?: string;
  play_count: number;
  rating: number;
  comment?: string;
  artwork_path?: string;
  genre?: string;
  genre_source?: string; // 'user' | 'tag' | 'ai'
  // Analysis fields (from track_analysis table via LEFT JOIN)
  bpm?: number;
  bpm_confidence?: number;
  musical_key?: string;
  key_confidence?: number;
}

export interface ScanResult {
  total_files: number;
  imported: number;
  skipped: number;
  errors: ScanError[];
}

export interface ScanError {
  file_path: string;
  error: string;
}

// Folder tree types
export interface FolderInfo {
  name: string;
  path: string;
  track_count: number;
  has_subfolders: boolean;
}

// Playlist types
export interface Playlist {
  id: number;
  name: string;
  playlist_type: string; // "manual" | "smart" | "folder"
  parent_id: number | null;
  track_count: number;
  created_at?: string;
  updated_at?: string;
}

// Analysis result types
export interface BpmResult {
  track_id: number;
  bpm: number;
  confidence: number;
}

export interface KeyResult {
  track_id: number;
  camelot: string;
  open_key: string;
  musical_key: string;
  confidence: number;
}

export interface TrackAnalysis {
  track_id: number;
  bpm?: number;
  bpm_confidence?: number;
  musical_key?: string;
  key_confidence?: number;
  loudness_lufs?: number;
  dynamic_range?: number;
  spectral_centroid?: number;
  analyzed_at?: string;
}

// Genre types
export interface GenreCount {
  genre: string;
  count: number;
}

export interface GenreDefinition {
  id: number;
  name: string;
  color?: string;
  sort_order: number;
}
