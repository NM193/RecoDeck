// src/lib/dj/tracks.ts
/**
 * A DJ's tracks in the Spotify section's row shape, so its filters, counts and
 * row actions (play, SelectedRecs, Copy, Yes / No) work on them unchanged.
 */
import type { Ownership } from '../spotify/ownership'
import type { SpotifyRow } from '../spotify/rows'
import type { SpotifyTrack } from '../../types/spotify'
import type { DjTrack } from '../../types/dj'

export function asSpotifyTrack(track: DjTrack): SpotifyTrack {
  return {
    spotifyId: track.spotifyId,
    title: track.title,
    artists: track.artists,
    album: track.album,
    durationMs: track.durationMs,
  }
}

/**
 * Newest release first, undated last. The release date rides in `addedAt`,
 * the field the Spotify table sorts and shows by.
 */
export function djRows(
  tracks: DjTrack[],
  ownership: Map<string, Ownership>,
): SpotifyRow[] {
  return tracks
    .map((track) => ({
      track: asSpotifyTrack(track),
      ownership: ownership.get(track.spotifyId) ?? { kind: 'missing' as const },
      addedAt: track.releaseDate,
      lists: [],
      isNew: false,
    }))
    .sort((a, b) => {
      if (a.addedAt !== b.addedAt) {
        if (!a.addedAt) return 1
        if (!b.addedAt) return -1
        return a.addedAt < b.addedAt ? 1 : -1
      }
      return a.track.title.localeCompare(b.track.title)
    })
}

/** "2024" out of "2024-03-01", "2024-03" or "2024". */
export function releasedYear(date: string | null): string {
  return date ? date.slice(0, 4) : ''
}

/** How many rows are Owned — "you own 23"; Maybe does not count. */
export function ownedCount(rows: Pick<SpotifyRow, 'ownership'>[]): number {
  return rows.filter((row) => row.ownership.kind === 'owned').length
}
