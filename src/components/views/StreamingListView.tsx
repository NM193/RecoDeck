// src/components/views/StreamingListView.tsx
// One list of a streaming service — or All playlists — against the library:
// what is Owned, what is Missing, and what might be either. SpotifyView and
// YouTubeMusicView hand it their rows, the words each row shows, and their
// Status cell. The look is SpotifyView.css's.
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../Icon'
import { useNow } from '../spotify/useNow'
import type { Track } from '../../types/track'
import type { Ownership } from '../../lib/spotify/ownership'
import {
  countByStatus,
  fileName,
  filterRowsBy,
  formatAdded,
  type StatusFilter,
} from '../../lib/spotify/rows'
import { getErrorMessage, isAppError, type AppErrorKind } from '../../types/ai'
import { GLIDE } from '../../lib/glide/glide'
import { useHoverGlide } from '../../lib/glide/useGlide'
import './SpotifyView.css'

/** What every service's row carries. */
export interface StreamRow {
  ownership: Ownership
  /** Newest added_at across the lists shown (ISO), or null. */
  addedAt: string | null
  /** Names of the lists it is in, in sidebar order. */
  lists: string[]
  /** New since the list was opened, and not owned: the indigo dot. */
  isNew: boolean
}

/** The words a row shows, and what the search box looks through. */
export interface RowText {
  key: string
  title: string
  /** The title cell's tooltip. */
  titleTip: string
  artist: string
  search: string
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'maybe', label: 'Maybe' },
  { key: 'owned', label: 'Owned' },
]

interface StreamingListViewProps<R extends StreamRow> {
  /** "Spotify", "YouTube Music": the reconnect bar and the sync button name it. */
  serviceName: string
  /** The cover's colours: `spotify-header__cover--<service>`. */
  service: 'spotify' | 'youtube-music'
  /** Shown in capitals above the title. */
  kicker: string
  title: string
  coverIcon: 'Heart' | 'ListMusic'
  rows: R[]
  /** Kept stable (module level): it is a memo dependency. */
  describe: (row: R) => RowText
  /** The Status cell: what it is, and what can be done about it. */
  renderStatus: (row: R) => ReactNode
  /** All playlists: a Playlist column. */
  showLists: boolean
  /** The list is not stored (gone, or removed): what the empty table says. */
  missingText: string | null
  filter: StatusFilter
  onFilter: (filter: StatusFilter) => void
  /** The library has not arrived yet: statuses are not known. */
  checking: boolean
  /** The whole library, to play an Owned row's file. */
  libraryTracks: Track[]
  /** App's player: plays a library file with a queue. */
  onPlayTrack: (track: Track, queue: Track[], index: number) => void
  syncing: boolean
  /** The meta line's last part ("synced 2 min ago"), given the clock. */
  syncText: (now: number | null) => string
  onSync: () => void
  needsReconnect: boolean
  /** Rejects with the error when the login fails. */
  onReconnect: () => Promise<void>
  /** The kind a newer Connect cancels this login with; not shown. */
  loginCancelledKind: AppErrorKind
  /** After the counts on the meta line: "no longer available". */
  notice?: string
  /** After the footer's sort note: "2 unavailable". */
  footerNote?: string
  /** Below the table: YouTube Music's Sets group. */
  afterTable?: ReactNode
}

export function StreamingListView<R extends StreamRow>({
  serviceName,
  service,
  kicker,
  title,
  coverIcon,
  rows,
  describe,
  renderStatus,
  showLists,
  missingText,
  filter,
  onFilter,
  checking,
  libraryTracks,
  onPlayTrack,
  syncing,
  syncText,
  onSync,
  needsReconnect,
  onReconnect,
  loginCancelledKind,
  notice,
  footerNote,
  afterTable,
}: StreamingListViewProps<R>) {
  const now = useNow(30_000)
  const nowDate = useMemo(() => (now === null ? null : new Date(now)), [now])
  const [query, setQuery] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectError, setReconnectError] = useState<string | null>(null)
  /** Each Reconnect click; only the newest one's end clears "Waiting…". */
  const reconnectSeq = useRef(0)
  // The hover slides from row to row (Micro-interactions spec, Rows).
  const tableRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(tableRef, glideRef, '.spotify-row--data', GLIDE.row)

  const counts = useMemo(() => countByStatus(rows), [rows])
  const shown = useMemo(
    () => filterRowsBy(rows, filter, query, (row) => describe(row).search),
    [rows, filter, query, describe],
  )

  // The player wants full Tracks: look the matched file up in the loaded library.
  const tracksById = useMemo(
    () => new Map(libraryTracks.map((track) => [track.id, track])),
    [libraryTracks],
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

  const playOwned = (row: R) => {
    const file = row.ownership.file
    if (row.ownership.kind !== 'owned' || !file) return
    const index = ownedQueue.findIndex((track) => track.id === file.id)
    if (index >= 0) onPlayTrack(ownedQueue[index], ownedQueue, index)
  }

  const emptyText = (): string => {
    if (missingText) return missingText
    if (rows.length === 0)
      return 'Nothing here yet — the first sync may still be running.'
    if (checking) return 'Checking your library…'
    // Rows under this filter, so the search is what hid them.
    if (counts[filter] > 0) return 'Nothing matches.'
    switch (filter) {
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

  // Clicking again while waiting starts a fresh login; Rust cancels the old one.
  const reconnect = () => {
    const seq = ++reconnectSeq.current
    setReconnecting(true)
    setReconnectError(null)
    onReconnect()
      .catch((e: unknown) => {
        // A newer Connect cancelled this login on purpose.
        if (isAppError(e) && e.kind === loginCancelledKind) return
        if (seq === reconnectSeq.current) setReconnectError(getErrorMessage(e))
      })
      .finally(() => {
        if (seq === reconnectSeq.current) setReconnecting(false)
      })
  }

  const rowClass = (extra: string) =>
    `spotify-row ${extra} ${showLists ? 'spotify-row--lists' : ''}`

  return (
    <div className="spotify-view">
      {needsReconnect && (
        <div className="spotify-reconnect" role="alert">
          <span>
            {serviceName} needs you to sign in again. Your lists stay as they
            were.
          </span>
          <button
            type="button"
            className="spotify-mini spotify-mini--primary"
            onClick={reconnect}
            data-tip={
              reconnecting
                ? 'Closed the browser tab? Click to sign in again'
                : undefined
            } aria-description={
              reconnecting
                ? 'Closed the browser tab? Click to sign in again'
                : undefined
            }
          >
            {reconnecting
              ? `Waiting for ${serviceName}… (try again)`
              : `Reconnect ${serviceName}`}
          </button>
          {reconnectError && (
            <span className="spotify-reconnect__error">{reconnectError}</span>
          )}
        </div>
      )}

      <header className="spotify-header">
        <div
          className={`spotify-header__cover spotify-header__cover--${service}`}
        >
          <Icon name={coverIcon} size={36} strokeWidth={1.75} />
        </div>
        <div className="spotify-header__info">
          <div className="spotify-header__kicker">{kicker}</div>
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
            {notice && (
              <span className="spotify-header__notice">· {notice}</span>
            )}
            <button
              type="button"
              className="spotify-header__sync"
              onClick={onSync}
              disabled={syncing}
              data-tip={`Sync with ${serviceName} now`} aria-description={`Sync with ${serviceName} now`}
            >
              <Icon name="RefreshCw" size={12} />
              {syncText(now)}
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
            data-page-search
            spellCheck={false}
          />
        </label>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`spotify-chip ${filter === key ? 'spotify-chip--on' : ''}`}
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
          >
            {/* Until the library is known only the total is. */}
            {label}{' '}
            <small>{checking && key !== 'all' ? '…' : counts[key]}</small>
          </button>
        ))}
      </div>

      <div
        ref={tableRef}
        className="glide-track spotify-table"
        role="table"
        aria-label={title}
      >
        <span ref={glideRef} className="glide" aria-hidden="true" />
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

        {shown.map((row, index) => {
          const text = describe(row)
          return (
            <Fragment key={text.key}>
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
                  data-tip={text.titleTip} aria-description={text.titleTip}
                >
                  {row.isNew && (
                    <i
                      className="spotify-new-dot"
                      role="img"
                      aria-label="New"
                    />
                  )}
                  {text.title}
                </span>
                <span
                  className="spotify-cell--artist"
                  role="cell"
                  data-tip={text.artist} data-tip-overflow
                >
                  {text.artist}
                </span>
                {showLists && (
                  <span
                    className="spotify-cell--lists"
                    role="cell"
                    data-tip={row.lists.join(', ')} data-tip-overflow
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
                  {renderStatus(row)}
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
                    <code data-tip={row.ownership.file.file_path} aria-description={row.ownership.file.file_path}>
                      {fileName(row.ownership.file.file_path)}
                    </code>
                    <span className="spotify-hint__why">
                      · {row.ownership.reason}
                    </span>
                  </span>
                </div>
              )}
            </Fragment>
          )
        })}

        {shown.length === 0 && (
          <div className="spotify-empty" role="row">
            <span role="cell">{emptyText()}</span>
          </div>
        )}
      </div>

      {afterTable}

      <div className="spotify-footer">
        {shown.length} of {rows.length} · sorted by date added, newest first
        {footerNote ? ` · ${footerNote}` : ''}
      </div>
    </div>
  )
}
