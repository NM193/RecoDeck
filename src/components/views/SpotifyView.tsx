// src/components/views/SpotifyView.tsx
// One Spotify list — or All playlists — against the library: what is Owned,
// what is Missing, and what might be either.
import { useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useNow } from '../spotify/useNow'
import type { SpotifyData } from '../spotify/useSpotify'
import { countByStatus, formatSynced, rowsFor } from '../../lib/spotify/rows'
import { getErrorMessage, isAppError } from '../../types/ai'
import { ALL_LISTS, LIKED } from '../../types/spotify'
import './SpotifyView.css'

interface SpotifyViewProps {
  /** ALL_LISTS, LIKED, or a playlist id. */
  listId: string
  spotify: SpotifyData
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
  if (status?.lastError)
    return ago
      ? `last synced ${ago} · couldn't reach Spotify`
      : "couldn't reach Spotify"
  if (!status?.lastSyncedAt) return 'not synced yet'
  return ago ? `synced ${ago}` : 'synced'
}

export function SpotifyView({ listId, spotify }: SpotifyViewProps) {
  const now = useNow(30_000)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  const list = spotify.library.lists.find((l) => l.id === listId)
  const title =
    listId === ALL_LISTS ? 'All playlists' : (list?.name ?? 'Spotify playlist')

  const rows = useMemo(
    () =>
      rowsFor(listId, spotify.library, spotify.ownership, spotify.seenBefore),
    [listId, spotify.library, spotify.ownership, spotify.seenBefore],
  )
  const counts = useMemo(() => countByStatus(rows), [rows])

  const reconnect = () => {
    setReconnecting(true)
    setReconnectError(null)
    spotify
      .reconnect()
      .catch((e: unknown) => {
        // A newer Connect cancelled this login on purpose.
        if (isAppError(e) && e.kind === 'SpotifyLoginCancelled') return
        setReconnectError(getErrorMessage(e))
      })
      .finally(() => setReconnecting(false))
  }

  return (
    <div className="spotify-view">
      {spotify.status?.needsReconnect && (
        <div className="spotify-reconnect" role="alert">
          <span>
            Spotify needs you to sign in again. Your lists stay as they were.
          </span>
          <button
            type="button"
            className="spotify-mini spotify-mini--primary"
            disabled={reconnecting}
            onClick={reconnect}
          >
            {reconnecting ? 'Waiting for Spotify…' : 'Reconnect Spotify'}
          </button>
          {reconnectError && (
            <span className="spotify-reconnect__error">{reconnectError}</span>
          )}
        </div>
      )}

      <header className="spotify-header">
        <div className="spotify-header__cover">
          <Icon
            name={listId === LIKED ? 'Heart' : 'ListMusic'}
            size={36}
            strokeWidth={1.75}
          />
        </div>
        <div className="spotify-header__info">
          <div className="spotify-header__kicker">Spotify playlist</div>
          <h1 className="spotify-header__title">{title}</h1>
          <div className="spotify-header__meta">
            <b>{counts.all} tracks</b>·
            <span className="spotify-header__owned">{counts.owned} owned</span>·
            <span>{counts.missing} missing</span>·
            <span className="spotify-header__maybe">{counts.maybe} maybe</span>
            <button
              type="button"
              className="spotify-header__sync"
              onClick={spotify.syncNow}
              disabled={spotify.syncing}
              title="Sync with Spotify now"
            >
              <Icon name="RefreshCw" size={12} />
              {syncLine(spotify, now)}
            </button>
          </div>
        </div>
      </header>

      {listId !== ALL_LISTS && !list && (
        <p className="spotify-empty">
          This playlist is no longer on Spotify, or Spotify stopped sharing it.
        </p>
      )}
    </div>
  )
}
