// What the Duplicate Tracks modal shows about each copy. Facts every copy
// shares go once in the group's "Same for all" line; a copy's row shows only
// the facts that differ, so the difference is what the eye lands on.

import { formatTime } from '../trackTable/cells'
import type { DuplicateGroup, DuplicateTrack } from '../../types/track'

const LOSSLESS = new Set(['wav', 'aif', 'aiff', 'flac'])

/** "WAV", "AIFF", "MP3 320": lossless formats without their bitrate. */
function formatAudio(track: DuplicateTrack): string {
  const ext = (track.file_format ?? '').toLowerCase()
  const name = ext === 'aif' ? 'AIFF' : ext.toUpperCase() || '—'
  if (LOSSLESS.has(ext) || !track.bitrate) return name
  return `${name} ${track.bitrate}`
}

function formatMB(bytes?: number): string {
  if (bytes == null) return '—'
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function tags(track: DuplicateTrack): string {
  return `${track.title || 'Untitled'} — ${track.artist || 'Unknown artist'}`
}

const FIELDS: ((t: DuplicateTrack) => string)[] = [
  formatAudio,
  (t) => formatTime(t.duration_ms),
  (t) => formatMB(t.file_size),
  (t) => (t.analyzed ? 'analyzed' : 'not analyzed'),
]

export interface CopyFacts {
  /** Title — artist, from the recommended copy. */
  heading: string
  /** Facts every copy shares. */
  shared: string[]
  /** Per copy id: the facts that differ between copies. */
  differ: Map<number, string[]>
}

export function copyFacts(group: DuplicateGroup): CopyFacts {
  const tracks = group.tracks
  const lead =
    tracks.find((t) => t.id === group.recommended_keep_id) ?? tracks[0]
  const heading = lead ? tags(lead) : ''
  const shared: string[] = []
  const differing: ((t: DuplicateTrack) => string)[] = []
  for (const field of FIELDS) {
    const first = lead ? field(lead) : ''
    if (tracks.every((t) => field(t) === first)) shared.push(first)
    else differing.push(field)
  }
  const differ = new Map<number, string[]>()
  for (const t of tracks) {
    // A copy whose tags differ shows its own title and artist.
    const own = tags(t) === heading ? [] : [tags(t)]
    differ.set(t.id, [...own, ...differing.map((field) => field(t))])
  }
  return { heading, shared, differ }
}

/** A copy's place on disk: its folder's name and its file name. */
export function copyPlace(path: string): { folder: string; file: string } {
  const parts = path.split('/').filter(Boolean)
  return {
    folder: parts.length > 1 ? parts[parts.length - 2] : '',
    file: parts[parts.length - 1] ?? path,
  }
}
