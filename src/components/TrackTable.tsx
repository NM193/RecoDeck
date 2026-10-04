// Virtualized track table component with search and sort
// Search: frontend-side filtering across all text fields
// Sort: click column header to sort asc, click again for desc

import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import type { LibraryFolder, Track, Playlist } from '../types/track'
import { usePlayerStore } from '../store/playerStore'
import { audioPlayer } from '../lib/audioPlayer'
import { Icon } from './Icon'
import { Equalizer } from './Equalizer'
import { Menu } from './menu/Menu'
import { TrackCover } from './track-table/TrackCover'
import { trackMenuEntries } from './track-table/trackMenuEntries'
import { useLibraryFolders } from './track-table/useLibraryFolders'
import { isOverlayOpen, useOverlay } from '../lib/overlays'
import {
  NO_SELECTION,
  clickRow,
  moveCursor,
  selectAll,
  selectOnly,
  selectedTracks,
  trimSelection,
} from '../lib/trackTable/selection'
import {
  applyTrackFilter,
  isEmptyFilter,
  type TrackFilter,
} from '../lib/trackTable/filter'
import { trackCountLabel } from '../lib/trackTable/count'
import { tracksSubject } from '../lib/trackTable/bulkMessages'
import { FilterButton } from './track-table/FilterButton'
import { usePlayedTrackIds } from './track-table/usePlayedTrackIds'
import { usePlayCounts } from './track-table/usePlayCounts'
import { ColumnsButton } from './track-table/ColumnsButton'
import { TableHead } from './track-table/TableHead'
import { TrackCell } from './track-table/TrackCell'
import { gridTemplate, shownColumns } from '../lib/trackTable/columns'
import {
  DEFAULT_SORT,
  nextSort,
  sortTracks,
  visibleSort,
  type SortColumn,
  type SortState,
} from '../lib/trackTable/sort'
import { useTrackTableLayout } from '../store/trackTableLayoutStore'

// ⌘ selects on macOS, Ctrl elsewhere (Interactions spec); on macOS a
// Ctrl-click is a right-click.
const IS_MAC = navigator.platform.startsWith('Mac')

// --- Component ---

interface TrackTableProps {
  tracks: Track[]
  playlists?: Playlist[]
  selectedPlaylistId?: number | null
  playlistMode?: boolean
  onTrackClick?: (track: Track) => void
  onTrackDoubleClick?: (
    track: Track,
    sortedTracks: Track[],
    trackIndex: number,
  ) => void
  // The right-click menu's actions: each takes every selected track at once.
  onAnalyzeTracks?: (tracks: Track[]) => void
  onAddToPlaylist?: (tracks: Track[], playlistId: number) => void
  onRemoveFromPlaylist?: (tracks: Track[]) => void
  onSetGenre?: (tracks: Track[], genre: string) => void
  onClearGenre?: (tracks: Track[]) => void
  onMoveToFolder?: (tracks: Track[], folder: LibraryFolder) => void
  onUpdateTrack?: (track: Track) => void
  genreDefinitions?: Array<{ id: number; name: string; color?: string }>
  onGenerateAIPlaylist?: (track: Track) => void
  onGetPlaylistRecommendations?: (
    playlistId: number,
    playlistName: string,
  ) => void
  onOpenMixPrep?: (playlistId: number, playlistName: string) => void
  onSearch?: (query: string) => void
  /** The view's filter, held by App; null for none. */
  filter?: TrackFilter | null
  onFilterChange?: (filter: TrackFilter | null) => void
  /**
   * The view's track count for the toolbar; `tracks.length` when absent.
   * All Tracks passes the library's, which holds during a backend search.
   */
  totalCount?: number
  /** App's play-version number: raised after each play is recorded. */
  playVersion?: number
}

export interface TrackTableRef {
  scrollToCurrentTrack: () => void
}

export const TrackTable = forwardRef<TrackTableRef, TrackTableProps>(
  function TrackTable(
    {
      tracks,
      playlists = [],
      selectedPlaylistId = null,
      playlistMode = false,
      onTrackClick,
      onTrackDoubleClick,
      onAnalyzeTracks,
      onAddToPlaylist,
      onRemoveFromPlaylist,
      onSetGenre,
      onClearGenre,
      onMoveToFolder,
      onUpdateTrack,
      genreDefinitions = [],
      onGenerateAIPlaylist,
      onGetPlaylistRecommendations,
      onOpenMixPrep,
      onSearch,
      filter = null,
      onFilterChange,
      totalCount,
      playVersion = 0,
    },
    ref,
  ) {
    const parentRef = useRef<HTMLDivElement>(null)

    // Player store subscription for current track
    const currentTrack = usePlayerStore((state) => state.currentTrack)
    const isPlaying = usePlayerStore((state) => state.isPlaying)

    // The playing row's button: pause, or play on from where it stopped.
    const togglePlayback = () => {
      if (usePlayerStore.getState().isPlaying) {
        audioPlayer.pause()
      } else {
        audioPlayer
          .resume()
          .catch((err) => usePlayerStore.getState().setError(`Playback error: ${err}`))
      }
    }

    // The rows selected (track table spec, Selecting several)
    const [selection, setSelection] = useState(NO_SELECTION)

    // Search state
    const [searchQuery, setSearchQuery] = useState('')

    // Debounced backend search: notify parent after 300ms of no typing
    const searchTimerRef = useRef<number | null>(null)
    const handleSearchChange = useCallback(
      (value: string) => {
        setSearchQuery(value)
        if (onSearch) {
          if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
          searchTimerRef.current = setTimeout(() => {
            onSearch(value.trim())
          }, 300)
        }
      },
      [onSearch],
    )
    useEffect(() => {
      return () => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      }
    }, [])

    // The right-click menu, at the pointer; it acts on the selection.
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
    const closeMenu = useCallback(() => setMenuAt(null), [])

    // Set Genre ▸ Custom…: a name for the selected tracks
    const [customGenreInput, setCustomGenreInput] = useState<{
      tracks: Track[]
      value: string
    } | null>(null)

    // Comment editor state
    const [commentInput, setCommentInput] = useState<{
      visible: boolean
      track: Track | null
      value: string
    }>({ visible: false, track: null, value: '' })

    // The dialogs are overlays (Esc closes them), and give the table its keys
    // back when they close.
    const closeCustomGenre = () => {
      setCustomGenreInput(null)
      parentRef.current?.focus({ preventScroll: true })
    }
    const closeComment = () => {
      setCommentInput({ visible: false, track: null, value: '' })
      parentRef.current?.focus({ preventScroll: true })
    }
    useOverlay(customGenreInput !== null, closeCustomGenre)
    useOverlay(commentInput.visible, closeComment)

    // The playlists to add to: no folders, and not the one shown
    const actualPlaylists = useMemo(
      () =>
        playlists.filter(
          (p) => p.playlist_type !== 'folder' && p.id !== selectedPlaylistId,
        ),
      [playlists, selectedPlaylistId],
    )

    // Sort state — default: sort by title ascending
    const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

    // --- Search: filter tracks by query across all text fields ---
    const searchedTracks = useMemo(() => {
      if (!searchQuery.trim()) return tracks

      const query = searchQuery.toLowerCase().trim()

      return tracks.filter((track) => {
        const fields = [
          track.title,
          track.artist,
          track.album,
          track.label,
          track.comment,
          track.file_path,
          track.genre,
        ]
        return fields.some(
          (field) => field != null && field.toLowerCase().includes(query),
        )
      })
    }, [tracks, searchQuery])

    // --- Filter: after the search, so the search works inside it ---
    const filterActive = !isEmptyFilter(filter)
    const playedIds = usePlayedTrackIds(filter?.played !== undefined)
    // Played is set and the played tracks are not read yet: show no rows
    // rather than every row for a moment.
    const filterPending = filter?.played !== undefined && playedIds === null
    const filteredTracks = useMemo(
      () =>
        filterPending ? [] : applyTrackFilter(searchedTracks, filter, { playedIds }),
      [searchedTracks, filter, playedIds, filterPending],
    )
    const narrowed = searchQuery.trim() !== '' || filterActive

    // --- Columns: one layout for every track table (Columns panel) ---
    const layout = useTrackTableLayout((state) => state.layout)
    const grid = useMemo(() => gridTemplate(layout), [layout])
    const columns = useMemo(() => shownColumns(layout), [layout])
    const [columnsOpen, setColumnsOpen] = useState(false)
    const plays = usePlayCounts(
      columns.some((column) => column.id === 'plays'),
      playVersion,
    )

    // --- Sort: by the column whose head was clicked, if it is still shown ---
    const shownSort = visibleSort(sort, layout)
    const sortedTracks = useMemo(
      () => sortTracks(filteredTracks, shownSort, plays),
      [filteredTracks, shownSort, plays],
    )
    const handleSort = (column: SortColumn) => setSort(nextSort(shownSort, column))

    // Rows no longer shown leave the selection: adjusted while rendering, when
    // the rows shown change (search, filter, sort, a reload).
    const shownIds = useMemo(() => sortedTracks.map((t) => t.id), [sortedTracks])
    const [selectionRows, setSelectionRows] = useState(shownIds)
    if (selectionRows !== shownIds) {
      setSelectionRows(shownIds)
      setSelection((current) => trimSelection(current, shownIds))
    }
    const menuTracks = useMemo(
      () => (menuAt ? selectedTracks(selection, sortedTracks) : []),
      [menuAt, selection, sortedTracks],
    )
    // Its tracks left the view (a reload): the menu closes for good.
    if (menuAt && menuTracks.length === 0) setMenuAt(null)
    // Move to folder ▸'s list, read as the menu opens.
    const libraryFolders = useLibraryFolders(menuAt !== null && onMoveToFolder !== undefined)

    const HEADER_HEIGHT = 30

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 46,
      overscan: 10,
      scrollMargin: HEADER_HEIGHT,
      // A row moved to with the keys stays out from under the column heads.
      scrollPaddingStart: HEADER_HEIGHT,
    })

    // The focused table's keys (Interactions spec, Keyboard): ↑ ↓ move the
    // selection (Shift extends it), Enter plays, ⌘A selects every row shown,
    // Esc clears. Not while a menu, popover or dialog is open (Esc is
    // theirs), nor from a control inside a row.
    const handleTableKeys = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget || isOverlayOpen()) return
      const key = event.key
      if ((IS_MAC ? event.metaKey : event.ctrlKey) && key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelection((current) => selectAll(current, shownIds))
      } else if (key === 'Escape' && selection.ids.size > 0) {
        event.preventDefault()
        setSelection(NO_SELECTION)
      } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault()
        const next = moveCursor(selection, shownIds, key === 'ArrowDown' ? 1 : -1, event.shiftKey)
        setSelection(next)
        const index = next.cursor === null ? -1 : shownIds.indexOf(next.cursor)
        if (index !== -1) virtualizer.scrollToIndex(index, { align: 'auto' })
      } else if (key === 'Enter' && !event.repeat) {
        const index = selection.cursor === null ? -1 : shownIds.indexOf(selection.cursor)
        if (index === -1) return
        event.preventDefault()
        onTrackDoubleClick?.(sortedTracks[index], sortedTracks, index)
      }
    }

    // Expose scroll to current track method via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToCurrentTrack: () => {
          if (!currentTrack || !parentRef.current) return

          // Find the current track in the sorted tracks
          const index = sortedTracks.findIndex(
            (t) =>
              t.id === currentTrack.id &&
              t.file_path === currentTrack.file_path,
          )

          if (index === -1) {
            console.warn(
              '[TrackTable] Current track not found in sorted tracks',
            )
            return
          }

          console.log(
            `[TrackTable] Scrolling to track at index ${index}: ${currentTrack.title}`,
          )

          // Scroll to the track using the virtualizer
          virtualizer.scrollToIndex(index, {
            align: 'center',
            behavior: 'smooth',
          })

          // Optional: Add a brief flash/highlight effect
          setTimeout(() => {
            const element = parentRef.current?.querySelector(
              `[data-index="${index}"]`,
            ) as HTMLElement
            if (element) {
              // --row-bg, so the sticky # and artwork cells flash too.
              element.style.setProperty(
                '--row-bg',
                'color-mix(in srgb, var(--bg-primary), var(--accent) 30%)',
              )
              setTimeout(() => {
                element.style.removeProperty('--row-bg')
              }, 600)
            }
          }, 100)
        },
      }),
      [currentTrack, sortedTracks, virtualizer],
    )

    // The comment editor and the stars, where tracks can be edited.
    const editComment = onUpdateTrack
      ? (track: Track) =>
          setCommentInput({ visible: true, track, value: track.comment || '' })
      : undefined
    const rate = onUpdateTrack
      ? (track: Track, rating: number) => onUpdateTrack({ ...track, rating })
      : undefined

    const saveCustomGenre = () => {
      const genre = customGenreInput?.value.trim()
      if (!customGenreInput || !genre || !onSetGenre) return
      onSetGenre(customGenreInput.tracks, genre)
      closeCustomGenre()
    }

    const saveComment = () => {
      if (!commentInput.track || !onUpdateTrack) return
      const trimmed = commentInput.value.trim()
      onUpdateTrack({ ...commentInput.track, comment: trimmed ? trimmed : undefined })
      closeComment()
    }

    return (
      <div className="track-table-container">
        {/* Toolbar: search, Filter, the AI buttons, the count */}
        <div className="track-table-toolbar">
          <div className="search-input-wrapper">
            <span className="search-icon">⌕</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search tracks..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => handleSearchChange('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {onFilterChange && (
            <FilterButton
              tracks={tracks}
              filter={filter}
              onChange={onFilterChange}
              shownCount={sortedTracks.length}
            />
          )}
          <ColumnsButton open={columnsOpen} onOpenChange={setColumnsOpen} />
          {/* AI Recommendations for current playlist (DISC-02) */}
          {onGetPlaylistRecommendations &&
            selectedPlaylistId != null &&
            (() => {
              const playlist = playlists.find(
                (p) => p.id === selectedPlaylistId,
              )
              if (!playlist) return null
              return (
                <button
                  type="button"
                  className="track-table-ai-rec-btn"
                  onClick={() =>
                    onGetPlaylistRecommendations(
                      selectedPlaylistId,
                      playlist.name,
                    )
                  }
                  title="Get AI recommendations for this playlist"
                >
                  <Icon name="Compass" size={16} />
                  <span>Recommend</span>
                </button>
              )
            })()}
          {/* Mix Prep for current playlist (MIXP-01, MIXP-02, MIXP-03) */}
          {onOpenMixPrep &&
            selectedPlaylistId != null &&
            (() => {
              const playlist = playlists.find(
                (p) => p.id === selectedPlaylistId,
              )
              if (!playlist) return null
              return (
                <button
                  type="button"
                  className="track-table-ai-rec-btn"
                  onClick={() =>
                    onOpenMixPrep(selectedPlaylistId, playlist.name)
                  }
                  title="Mix preparation analysis"
                >
                  <Icon name="AudioWaveform" size={16} />
                  <span>Mix Prep</span>
                </button>
              )
            })()}
          <span className="track-table-count">
            {trackCountLabel(
              sortedTracks.length,
              totalCount ?? tracks.length,
              narrowed,
              selection.ids.size,
            )}
          </span>
        </div>

        {/* Scroll area: header + body scroll together */}
        <div
          ref={parentRef}
          className="track-table-scroll-area"
          tabIndex={0}
          onKeyDown={handleTableKeys}
          style={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          <div
            className="track-table-holder"
            style={
              {
                '--tt-min': `${grid.minWidth}px`,
                '--tt-grid': grid.template,
              } as CSSProperties
            }
          >
          {/* Column headers — sticky inside scroll area */}
          <div className="track-table-header">
            <TableHead
              layout={layout}
              sort={shownSort}
              onSort={handleSort}
              onOpenColumns={() => setColumnsOpen(true)}
            />
          </div>
          {/* Virtualized body */}
          <div className="track-table-body">
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const track = sortedTracks[virtualRow.index]
                // Use both ID and file path for maximum reliability when identifying the playing track
                const isPlayingTrack =
                  currentTrack != null &&
                  track.id === currentTrack.id &&
                  track.file_path === currentTrack.file_path
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    className={`track-table-row data-row ${isPlayingTrack ? 'data-row--playing' : ''} ${selection.ids.has(track.id) ? 'data-row--selected' : ''}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      // start counts from the top of the scroll area, header
                      // included (scrollMargin); the body already sits under it.
                      transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                    }}
                    // Shift-click selects rows, not the text in them.
                    onMouseDown={(e) => {
                      if (e.shiftKey) e.preventDefault()
                    }}
                    onClick={(e) => {
                      if (IS_MAC && e.ctrlKey) return // a right-click: the menu has it
                      setSelection((current) =>
                        clickRow(
                          current,
                          track.id,
                          { toggle: IS_MAC ? e.metaKey : e.ctrlKey, range: e.shiftKey },
                          shownIds,
                        ),
                      )
                      // The table takes the keys (↑ ↓, ⌘A, Esc, Enter).
                      parentRef.current?.focus({ preventScroll: true })
                      onTrackClick?.(track)
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation() // Prevent event bubbling
                      console.log('[TrackTable] Double-click on track:', {
                        id: track.id,
                        title: track.title,
                        file_path: track.file_path,
                        virtualIndex: virtualRow.index,
                        actualTrack: track,
                        trackAtIndex: sortedTracks[virtualRow.index],
                        indexMatches: sortedTracks[virtualRow.index] === track,
                        sortedTracksLength: sortedTracks.length,
                      })
                      // Pass the sorted/filtered tracks array and the actual index so the queue respects the current view
                      onTrackDoubleClick?.(
                        track,
                        sortedTracks,
                        virtualRow.index,
                      )
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      // On a row not selected, it selects that row alone first.
                      if (!selection.ids.has(track.id)) setSelection(selectOnly(track.id))
                      parentRef.current?.focus({ preventScroll: true })
                      setMenuAt({ x: e.clientX, y: e.clientY })
                    }}
                  >
                    <div className="tt-cell cell-index">
                      {isPlayingTrack ? (
                        <Equalizer playing={isPlaying} />
                      ) : (
                        <span className="row-number">
                          {playlistMode ? virtualRow.index + 1 : virtualRow.index + 1}
                        </span>
                      )}
                      {/* Under the mouse: ▶ plays the row (as a double click);
                          on the row playing, pause or play on. */}
                      <button
                        type="button"
                        className="row-action"
                        aria-label={
                          isPlayingTrack ? (isPlaying ? 'Pause' : 'Play') : `Play ${track.title || 'track'}`
                        }
                        onClick={(e) => {
                          // The second click of a double click: the first did it.
                          if (e.detail > 1) return
                          if (isPlayingTrack) togglePlayback()
                          else onTrackDoubleClick?.(track, sortedTracks, virtualRow.index)
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <Icon name={isPlayingTrack && isPlaying ? 'Pause' : 'Play'} size={14} />
                      </button>
                    </div>
                    {layout.artwork && (
                      <div className="tt-cell cell-art">
                        <TrackCover key={`${track.id}\n${track.file_path}`} track={track} />
                      </div>
                    )}
                    {columns.map((column) => (
                      <TrackCell
                        key={column.id}
                        column={column.id}
                        track={track}
                        plays={plays}
                        onEditComment={editComment}
                        onRate={rate}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
          {sortedTracks.length === 0 && narrowed && !filterPending && (
            <div className="track-table-no-match">
              No tracks match
              {filterActive && onFilterChange && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onFilterChange(null)}
                  >
                    Clear filter
                  </button>
                </>
              )}
            </div>
          )}
          </div>
        </div>

        {/* The right-click menu: acts on every selected track */}
        {menuAt && menuTracks.length > 0 && (
          <Menu
            at={menuAt}
            label={menuTracks.length === 1 ? 'Track' : `${menuTracks.length} tracks`}
            onClose={closeMenu}
            entries={trackMenuEntries({
              tracks: menuTracks,
              playlists: actualPlaylists,
              genres: genreDefinitions,
              onAddToPlaylist,
              onAnalyze: onAnalyzeTracks,
              onSetGenre,
              onCustomGenre: (selected) =>
                setCustomGenreInput({
                  tracks: selected,
                  value:
                    selected.every((t) => t.genre === selected[0].genre)
                      ? selected[0].genre || ''
                      : '',
                }),
              onClearGenre,
              folders: libraryFolders,
              onMoveToFolder,
              onRemoveFromPlaylist:
                selectedPlaylistId != null ? onRemoveFromPlaylist : undefined,
              onEditComment: editComment,
              onGenerateAIPlaylist,
            })}
          />
        )}

        {/* Set Genre ▸ Custom…: a name for the selected tracks */}
        {customGenreInput && onSetGenre && (
          <div className="modal-overlay" onClick={closeCustomGenre}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Set Genre</h3>
              <p className="modal-subtitle">{tracksSubject(customGenreInput.tracks)}</p>
              <input
                type="text"
                className="modal-input"
                placeholder="Enter genre name..."
                value={customGenreInput.value}
                onChange={(e) =>
                  setCustomGenreInput({ ...customGenreInput, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveCustomGenre()
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button modal-button-secondary"
                  onClick={closeCustomGenre}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={saveCustomGenre}
                  disabled={!customGenreInput.value.trim()}
                >
                  Set Genre
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Comment Editor Modal */}
        {commentInput.visible && commentInput.track && onUpdateTrack && (
          <div className="modal-overlay" onClick={closeComment}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>
                {commentInput.track.comment ? 'Edit Comment' : 'Add Comment'}
              </h3>
              <p className="modal-subtitle">
                {commentInput.track.title || 'Untitled'}
              </p>
              <textarea
                className="modal-input modal-textarea"
                placeholder="Enter a comment..."
                value={commentInput.value}
                onChange={(e) =>
                  setCommentInput((prev) => ({
                    ...prev,
                    value: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    saveComment()
                  }
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button modal-button-secondary"
                  onClick={closeComment}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={saveComment}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  },
)
