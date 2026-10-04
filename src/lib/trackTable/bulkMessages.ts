// src/lib/trackTable/bulkMessages.ts
// What the toasts say after the track table's right-click menu acts on its
// selection (track table spec, Right-click menu), and what a genre Undo puts
// back. One track is named by its title, several are counted.
import type { Track, TrackGenre } from '../../types/track'

type Titled = Pick<Track, 'title'>

/** "Juz Listen'", "12 tracks", "1,204 tracks". */
export function tracksSubject(tracks: readonly Titled[]): string {
  if (tracks.length === 1 && tracks[0].title) return tracks[0].title
  const n = tracks.length
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'track' : 'tracks'}`
}

/** "Added 12 tracks to Peak Time", with " · 2 already there" when some were. */
export function addedMessage(added: readonly Titled[], already: number, playlist: string): string {
  const message = `Added ${tracksSubject(added)} to ${playlist}`
  return already > 0 ? `${message} · ${already.toLocaleString('en-US')} already there` : message
}

/** Nothing was added: every track was there already. */
export function alreadyMessage(tracks: readonly Titled[], playlist: string): string {
  return tracks.length === 1 ? `Already in ${playlist}` : `All ${tracksSubject(tracks)} are already in ${playlist}`
}

export function removedMessage(tracks: readonly Titled[], playlist: string): string {
  return `Removed ${tracksSubject(tracks)} from ${playlist}`
}

export function genreSetMessage(tracks: readonly Titled[], genre: string): string {
  return `Genre set to "${genre}" for ${tracksSubject(tracks)}`
}

export function genreClearedMessage(tracks: readonly Titled[]): string {
  return `Genre cleared for ${tracksSubject(tracks)}`
}

/** Each track's genre and its source, as a genre Undo puts them back. */
export function genreSnapshot(
  tracks: readonly Pick<Track, 'id' | 'genre' | 'genre_source'>[],
): TrackGenre[] {
  return tracks.map((track) => ({
    id: track.id,
    genre: track.genre ?? null,
    source: track.genre_source ?? null,
  }))
}
