// src/components/views/SpotifyView.tsx
// One Spotify list — or All playlists — against the library. The view itself
// is StreamingListView; this gives it Spotify's rows, words and actions.
import { useMemo } from 'react'
import { StreamingListView, type RowText } from './StreamingListView'
import { SpotifyRowActions } from '../spotify/SpotifyRowActions'
import type { Track } from '../../types/track'
import type { SpotifyData } from '../spotify/useSpotify'
import {
  formatSynced,
  rowsFor,
  spotifySearchText,
  syncErrorText,
  type SpotifyRow,
} from '../../lib/spotify/rows'
import { ALL_LISTS, LIKED } from '../../types/spotify'

interface SpotifyViewProps {
  /** ALL_LISTS, LIKED, or a playlist id. */
  listId: string
  spotify: SpotifyData
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
}

function describeRow(row: SpotifyRow): RowText {
  return {
    key: row.track.spotifyId,
    title: row.track.title,
    titleTip: row.track.title,
    artist: row.track.artists,
    search: spotifySearchText(row),
  }
}

/** The meta line's last part: "synced 2 min ago", or why not. */
function syncLine(spotify: SpotifyData, now: number | null): string {
  if (spotify.syncing) return 'syncing…'
  const status = spotify.status
  const ago =
    status?.lastSyncedAt && now !== null
      ? formatSynced(status.lastSyncedAt, now)
      : null
  if (status?.needsReconnect) return ago ? `last synced ${ago}` : 'not synced'
  if (status?.lastError) {
    const why = syncErrorText(status.lastErrorKind)
    return ago ? `last synced ${ago} · ${why}` : why
  }
  if (!status?.lastSyncedAt) return 'not synced yet'
  return ago ? `synced ${ago}` : 'synced'
}

export function SpotifyView({
  listId,
  spotify,
  onPlayTrack,
}: SpotifyViewProps) {
  const list = spotify.library.lists.find((l) => l.id === listId)
  const rows = useMemo(
    () =>
      rowsFor(listId, spotify.library, spotify.ownership, spotify.seenBefore),
    [listId, spotify.library, spotify.ownership, spotify.seenBefore],
  )
  const checking = !spotify.libraryLoaded

  return (
    <StreamingListView
      serviceName="Spotify"
      service="spotify"
      kicker="Spotify playlist"
      title={
        listId === ALL_LISTS
          ? 'All playlists'
          : (list?.name ?? 'Spotify playlist')
      }
      coverIcon={listId === LIKED ? 'Heart' : 'ListMusic'}
      rows={rows}
      describe={describeRow}
      renderStatus={(row) => (
        <SpotifyRowActions
          row={row}
          checking={checking}
          onVerdict={(verdict) =>
            row.ownership.file
              ? spotify.setVerdict(
                  row.track.spotifyId,
                  row.ownership.file.id,
                  verdict,
                )
              : Promise.resolve()
          }
        />
      )}
      showLists={listId === ALL_LISTS}
      missingText={
        listId !== ALL_LISTS && !list
          ? 'This playlist is no longer on Spotify, or Spotify stopped sharing it.'
          : null
      }
      filter={spotify.filter}
      onFilter={spotify.setFilter}
      checking={checking}
      libraryTracks={spotify.libraryTracks}
      onPlayTrack={onPlayTrack}
      syncing={spotify.syncing}
      syncText={(now) => syncLine(spotify, now)}
      onSync={spotify.syncNow}
      needsReconnect={spotify.status?.needsReconnect ?? false}
      onReconnect={spotify.reconnect}
      loginCancelledKind="SpotifyLoginCancelled"
    />
  )
}
