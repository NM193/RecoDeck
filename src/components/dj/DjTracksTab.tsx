// src/components/dj/DjTracksTab.tsx
// The Tracks tab: every track the DJ made or remixed, in the Spotify view's
// table (its classes, chips and row actions, Maybe's Yes/No included), newest
// release first, then "Load older releases" when Spotify lists more.
import { useMemo, useRef, useState } from 'react'
import { Icon } from '../Icon'
import { useShowAfter } from '../../lib/useShowAfter'
import { SpotifyRowActions } from '../spotify/SpotifyRowActions'
import {
  countByStatus,
  fileName,
  filterRows,
  type SpotifyRow,
  type StatusFilter,
} from '../../lib/spotify/rows'
import { releasedYear } from '../../lib/dj/tracks'
import { refreshFailed, type DjSourceStatus } from '../../lib/dj/page'
import {
  TRACK_FILTERS,
  ownedQueue,
  tracksEmptyText,
  tracksProgress,
  tracksTabState,
} from '../../lib/dj/tabs'
import type { LibraryTrack } from '../../lib/tracklist/match'
import type { Verdict } from '../../types/spotify'
import type { DjPage } from '../../types/dj'
import { GLIDE } from '../../lib/glide/glide'
import { useHoverGlide } from '../../lib/glide/useGlide'
import '../views/SpotifyView.css'

/** The Spotify view's status chips with their counts; `filters` picks which (the overview card shows three). */
export function StatusChips({
  counts,
  filter,
  onFilter,
  filters = TRACK_FILTERS,
  checking = false,
}: {
  counts: Record<StatusFilter, number>
  filter: StatusFilter
  onFilter: (filter: StatusFilter) => void
  filters?: { key: StatusFilter; label: string }[]
  /** The library has not arrived: only the total is known. */
  checking?: boolean
}) {
  return (
    <>
      {filters.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`spotify-chip ${filter === key ? 'spotify-chip--on' : ''}`}
          aria-pressed={filter === key}
          onClick={() => onFilter(key)}
        >
          {label} <small>{checking && key !== 'all' ? '…' : counts[key]}</small>
        </button>
      ))}
    </>
  )
}

interface DjTrackRowProps {
  row: SpotifyRow
  /** 1-based, as shown in the # column. */
  number: number
  /** Rejects when the answer could not be saved. */
  onVerdict: (row: SpotifyRow, verdict: Verdict) => Promise<void>
  /** Double-click: plays an Owned row's file. */
  onPlay: (row: SpotifyRow) => void
  /** The library has not arrived yet: the status is not known. */
  checking?: boolean
}

/** One track as the Spotify view draws it — `# · Title · Artist · Released · Status` — plus Maybe's sub-row. */
export function DjTrackRow({
  row,
  number,
  onVerdict,
  onPlay,
  checking = false,
}: DjTrackRowProps) {
  return (
    <>
      <div
        className={`spotify-row spotify-row--data ${row.ownership.kind === 'owned' ? 'spotify-row--owned' : ''}`}
        role="row"
        onDoubleClick={() => onPlay(row)}
      >
        <span className="spotify-cell--num" role="cell">
          {number}
        </span>
        <span
          className="spotify-cell--title"
          role="cell"
          title={
            row.track.album
              ? `${row.track.title} · ${row.track.album}`
              : row.track.title
          }
        >
          {row.track.title}
        </span>
        <span
          className="spotify-cell--artist"
          role="cell"
          title={row.track.artists}
        >
          {row.track.artists}
        </span>
        <span className="spotify-cell--added" role="cell">
          {releasedYear(row.addedAt)}
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
            onVerdict={(verdict) => onVerdict(row, verdict)}
          />
        </span>
      </div>
      {row.ownership.kind === 'maybe' && row.ownership.file && (
        <div className="spotify-row spotify-row--sub" role="row">
          <span role="cell" />
          <span className="spotify-hint" role="cell" aria-colspan={4}>
            In library:{' '}
            <code title={row.ownership.file.file_path}>
              {fileName(row.ownership.file.file_path)}
            </code>
            <span className="spotify-hint__why">· {row.ownership.reason}</span>
          </span>
        </div>
      )}
    </>
  )
}

/**
 * Grey bars where rows will be, in the table's own columns, while a first
 * fetch has nothing to show yet — shown after 150ms, so a quick one never
 * flashes, and holding their place until then.
 */
function TrackRowsSkeleton() {
  const shown = useShowAfter()
  return (
    <>
      {[62, 48, 70, 55, 66, 40, 58, 50].map((width, i) => (
        <div
          key={i}
          className="spotify-row dj-skeleton"
          aria-hidden="true"
          style={{ visibility: shown ? undefined : 'hidden' }}
        >
          <span className="spotify-cell--num">{i + 1}</span>
          <span>
            <i className="skeleton" style={{ width: `${width}%` }} />
          </span>
          <span>
            <i className="skeleton" style={{ width: `${width - 15}%` }} />
          </span>
          <span>
            <i className="skeleton" style={{ width: '60%' }} />
          </span>
          <span />
        </div>
      ))}
    </>
  )
}

interface DjTracksTabProps {
  /** Spotify's connection; null while its status is still being read. */
  connected: boolean | null
  /** The cached page; null until read once. */
  page: DjPage | null
  /** The page's tracks as Spotify rows (`djRows`), newest first. */
  rows: SpotifyRow[]
  /** The page's Spotify refresh. */
  spotify: DjSourceStatus
  progress: { done: number; total: number } | null
  loadingOlder: boolean
  onLoadOlder: () => void
  /** The library has not arrived yet: statuses are not known. */
  checking: boolean
  /** Maybe's Yes / No, stored in spotify_match_verdicts. Rejects when not saved. */
  onVerdict: (row: SpotifyRow, verdict: Verdict) => Promise<void>
  /** Plays library files, queued: the file at `index` first (DjView finds the Tracks). */
  onPlayFiles: (queue: LibraryTrack[], index: number) => void
  /** Settings, with its Spotify section open. */
  onOpenSettings: () => void
  /** The chip the tab opens on (read when it mounts): Missing from the overview's Missing card. */
  initialFilter?: StatusFilter
}

export function DjTracksTab({
  connected,
  page,
  rows,
  spotify,
  progress,
  loadingOlder,
  onLoadOlder,
  checking,
  onVerdict,
  onPlayFiles,
  onOpenSettings,
  initialFilter = 'all',
}: DjTracksTabProps) {
  const [filter, setFilter] = useState<StatusFilter>(initialFilter)
  const [query, setQuery] = useState('')
  // The hover slides from row to row (Micro-interactions spec, Rows).
  const tableRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(tableRef, glideRef, '.spotify-row--data', GLIDE.row)
  const counts = useMemo(() => countByStatus(rows), [rows])
  const shown = useMemo(
    () => filterRows(rows, filter, query),
    [rows, filter, query],
  )

  const state = tracksTabState({
    connected,
    loaded: page !== null,
    tracks: rows.length,
    spotify,
  })
  if (state === 'notConnected') {
    return (
      <div className="dj-connect">
        Connect Spotify to see their tracks
        <button type="button" className="btn btn--sm" onClick={onOpenSettings}>
          Settings → Spotify
        </button>
      </div>
    )
  }

  const playOwned = (row: SpotifyRow) => {
    const start = ownedQueue(
      shown.map((shownRow) => shownRow.ownership),
      row.ownership,
    )
    if (start) onPlayFiles(start.queue, start.index)
  }

  const loading = tracksProgress(spotify, progress)
  const failed = refreshFailed(spotify)

  return (
    <div className="dj-tracks">
      <div className="dj-tabhead">
        <span>
          {state === 'list'
            ? `${rows.length} ${rows.length === 1 ? 'track' : 'tracks'} & remixes, newest first`
            : 'Tracks & remixes'}
        </span>
        {loading && <span className="dj-tabhead__busy">· {loading}</span>}
        {failed && (
          <span
            className="dj-tabhead__failed"
            title={spotify.error ?? undefined}
          >
            · couldn&apos;t refresh
          </span>
        )}
      </div>

      {state === 'list' && (
        <div className="spotify-toolbar dj-toolbar">
          <label className="spotify-search">
            <Icon name="Search" size={14} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search their tracks…"
              data-page-search
              spellCheck={false}
            />
          </label>
          <StatusChips
            counts={counts}
            filter={filter}
            onFilter={setFilter}
            checking={checking}
          />
        </div>
      )}

      {state === 'empty' ? (
        <p className="dj-note">
          {tracksEmptyText(spotify, Boolean(page?.profile.spotifyArtistId))}
        </p>
      ) : (
        <div
          ref={tableRef}
          className="glide-track spotify-table dj-table"
          role="table"
          aria-label="Tracks and remixes"
        >
          <span ref={glideRef} className="glide" aria-hidden="true" />
          <div className="spotify-row spotify-row--head" role="row">
            <span className="spotify-cell--num" role="columnheader">
              #
            </span>
            <span role="columnheader">Title</span>
            <span role="columnheader">Artist</span>
            <span role="columnheader">Released</span>
            <span className="spotify-cell--status" role="columnheader">
              Status
            </span>
          </div>
          {state === 'skeleton' ? (
            <TrackRowsSkeleton />
          ) : (
            shown.map((row, index) => (
              <DjTrackRow
                key={row.track.spotifyId}
                row={row}
                number={index + 1}
                checking={checking}
                onVerdict={onVerdict}
                onPlay={playOwned}
              />
            ))
          )}
          {state === 'list' && shown.length === 0 && (
            <div className="spotify-empty" role="row">
              <span role="cell">Nothing matches.</span>
            </div>
          )}
        </div>
      )}

      {page?.profile.hasOlderReleases && state !== 'skeleton' && (
        <div className="dj-older">
          <button
            type="button"
            className="spotify-mini"
            disabled={loadingOlder || spotify.refreshing}
            onClick={onLoadOlder}
          >
            <Icon name={loadingOlder ? 'Loader' : 'History'} size={12} />
            {loadingOlder ? 'Loading older releases…' : 'Load older releases'}
          </button>
          <span>
            Older appearances on compilations and other artists&apos; releases
          </span>
        </div>
      )}
    </div>
  )
}
