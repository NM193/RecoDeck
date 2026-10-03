// src/components/views/SpotifyView.tsx
// One Spotify list — or All playlists — against the library: what is Owned,
// what is Missing, and what might be either.
import { Fragment, useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { SpotifyRowActions } from '../spotify/SpotifyRowActions'
import { useNow } from '../spotify/useNow'
import type { Track } from '../../types/track'
import type { SpotifyData } from '../spotify/useSpotify'
import {
  countByStatus,
  fileName,
  filterRows,
  formatAdded,
  formatSynced,
  rowsFor,
  type SpotifyRow,
  type StatusFilter,
} from '../../lib/spotify/rows'
import { getErrorMessage, isAppError } from '../../types/ai'
import { ALL_LISTS, LIKED } from '../../types/spotify'
import './SpotifyView.css'

interface SpotifyViewProps {
  /** ALL_LISTS, LIKED, or a playlist id. */
  listId: string
  spotify: SpotifyData
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'owned', label: 'Owned' },
]

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

export function SpotifyView({
  listId,
  spotify,
  onPlayTrack,
}: SpotifyViewProps) {
  const now = useNow(30_000)
  const nowDate = useMemo(() => (now === null ? null : new Date(now)), [now])
  const [query, setQuery] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)

  const list = spotify.library.lists.find((l) => l.id === listId)
  const title =
    listId === ALL_LISTS ? 'All playlists' : (list?.name ?? 'Spotify playlist')
  const showLists = listId === ALL_LISTS

  const rows = useMemo(
    () =>
      rowsFor(listId, spotify.library, spotify.ownership, spotify.seenBefore),
    [listId, spotify.library, spotify.ownership, spotify.seenBefore],
  )
  const counts = useMemo(() => countByStatus(rows), [rows])
  const shown = useMemo(
    () => filterRows(rows, spotify.filter, query),
    [rows, spotify.filter, query],
  )

  const checking = !spotify.libraryLoaded

  // The player wants full Tracks: look the matched file up in the loaded library.
  const tracksById = useMemo(
    () => new Map(spotify.libraryTracks.map((track) => [track.id, track])),
    [spotify.libraryTracks],
  )

  // Double-clicking an Owned row plays its file, queued with the other owned rows on screen.
  const ownedQueue = useMemo(
    () =>
      shown.flatMap((row) => {
        const id =
          row.ownership.kind === 'owned' ? row.ownership.file?.id : undefined
        const track = id === undefined ? undefined : tracksById.get(id)
        return track ? [track] : []
      }),
    [shown, tracksById],
  )

  const playOwned = (row: SpotifyRow) => {
    const file = row.ownership.file
    if (row.ownership.kind !== 'owned' || !file) return
    const index = ownedQueue.findIndex((track) => track.id === file.id)
    if (index >= 0) onPlayTrack(ownedQueue[index], ownedQueue, index)
  }

  const answer = (row: SpotifyRow, verdict: 'yes' | 'no') =>
    row.ownership.file
      ? spotify.setVerdict(row.track.spotifyId, row.ownership.file.id, verdict)
      : Promise.resolve()

  const emptyText = (): string => {
    if (listId !== ALL_LISTS && !list)
      return 'This playlist is no longer on Spotify, or Spotify stopped sharing it.'
    if (rows.length === 0)
      return 'Nothing here yet — the first sync may still be running.'
    if (checking) return 'Checking your library…'
    // Rows under this filter, so the search is what hid them.
    if (counts[spotify.filter] > 0) return 'Nothing matches.'
    switch (spotify.filter) {
      case 'missing':
        return 'Nothing missing.'
      case 'owned':
        return 'Nothing owned.'
      case 'maybe':
        return 'No maybes.'
      default:
        return 'Nothing matches.'
    }
  }

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

  const rowClass = (extra: string) =>
    `spotify-row ${extra} ${showLists ? 'spotify-row--lists' : ''}`

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
            {checking ? (
              <span className="spotify-header__checking">
                Checking your library…
              </span>
            ) : (
              <>
                <span className="spotify-header__owned">
                  {counts.owned} owned
                </span>
                ·<span>{counts.missing} missing</span>·
                <span className="spotify-header__maybe">
                  {counts.maybe} maybe
                </span>
              </>
            )}
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

      <div className="spotify-toolbar">
        <label className="spotify-search">
          <Icon name="Search" size={14} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title}…`}
            spellCheck={false}
          />
        </label>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`spotify-chip ${spotify.filter === key ? 'spotify-chip--on' : ''}`}
            aria-pressed={spotify.filter === key}
            onClick={() => spotify.setFilter(key)}
          >
            {/* Until the library is known only the total is. */}
            {label}{' '}
            <small>{checking && key !== 'all' ? '…' : counts[key]}</small>
          </button>
        ))}
      </div>

      <div className="spotify-table" role="table" aria-label={title}>
        <div className={rowClass('spotify-row--head')} role="row">
          <span className="spotify-cell--num" role="columnheader">
            #
          </span>
          <span role="columnheader">Title</span>
          <span role="columnheader">Artist</span>
          {showLists && <span role="columnheader">Playlist</span>}
          <span role="columnheader">Added</span>
          <span className="spotify-cell--status" role="columnheader">
            Status
          </span>
        </div>

        {shown.map((row, index) => (
          <Fragment key={row.track.spotifyId}>
            <div
              className={rowClass(
                `spotify-row--data ${row.ownership.kind === 'owned' ? 'spotify-row--owned' : ''}`,
              )}
              role="row"
              onDoubleClick={() => playOwned(row)}
            >
              <span className="spotify-cell--num" role="cell">
                {index + 1}
              </span>
              <span
                className="spotify-cell--title"
                role="cell"
                title={row.track.title}
              >
                {row.isNew && (
                  <i className="spotify-new-dot" role="img" aria-label="New" />
                )}
                {row.track.title}
              </span>
              <span
                className="spotify-cell--artist"
                role="cell"
                title={row.track.artists}
              >
                {row.track.artists}
              </span>
              {showLists && (
                <span
                  className="spotify-cell--lists"
                  role="cell"
                  title={row.lists.join(', ')}
                >
                  {row.lists.join(', ')}
                </span>
              )}
              <span className="spotify-cell--added" role="cell">
                {nowDate ? formatAdded(row.addedAt, nowDate) : ''}
              </span>
              {/* Double-clicking a button must not also play the row. */}
              <span
                className="spotify-cell--status"
                role="cell"
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <SpotifyRowActions
                  row={row}
                  checking={checking}
                  onVerdict={(verdict) => answer(row, verdict)}
                />
              </span>
            </div>
            {row.ownership.kind === 'maybe' && row.ownership.file && (
              <div className="spotify-row spotify-row--sub" role="row">
                <span role="cell" />
                <span
                  className="spotify-hint"
                  role="cell"
                  aria-colspan={showLists ? 5 : 4}
                >
                  In library:{' '}
                  <code title={row.ownership.file.file_path}>
                    {fileName(row.ownership.file.file_path)}
                  </code>
                  <span className="spotify-hint__why">
                    · {row.ownership.reason}
                  </span>
                </span>
              </div>
            )}
          </Fragment>
        ))}

        {shown.length === 0 && (
          <div className="spotify-empty" role="row">
            <span role="cell">{emptyText()}</span>
          </div>
        )}
      </div>

      <div className="spotify-footer">
        {shown.length} of {rows.length} · sorted by date added, newest first
      </div>
    </div>
  )
}
