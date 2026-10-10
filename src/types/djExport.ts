// Export to DJ software: what dj_export_defaults and export_to_dj answer.

export type DjTarget = 'rekordbox' | 'traktor' | 'serato'

export interface DjExportDefaults {
  path: string
  exists: boolean
  /** The playlists of this program's previous export. */
  playlist_ids: number[]
  /** Exported to this program before. */
  remembered: boolean
}

export interface SkippedTrack {
  artist: string
  title: string
  path: string
}

export interface DjExportResult {
  playlists: number
  tracks: number
  skipped: SkippedTrack[]
  written: string[]
}
