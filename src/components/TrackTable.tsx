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
} from 'react'
import type { Track, Playlist } from '../types/track'
import { usePlayerStore } from '../store/playerStore'
import { audioPlayer } from '../lib/audioPlayer'
import { Icon } from './Icon'
import { Equalizer } from './Equalizer'
import { TrackCover } from './track-table/TrackCover'
import {
  applyTrackFilter,
  isEmptyFilter,
  type TrackFilter,
} from '../lib/trackTable/filter'
import { trackCountLabel } from '../lib/trackTable/count'
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
  onAnalyzeTrack?: (track: Track) => void
  onAddToPlaylist?: (track: Track, playlistId: number) => void
  onRemoveFromPlaylist?: (track: Track) => void
  onSetGenre?: (track: Track, genre: string) => void
  onClearGenre?: (track: Track) => void
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
      onAnalyzeTrack,
      onAddToPlaylist,
      onRemoveFromPlaylist,
      onSetGenre,
      onClearGenre,
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
    const contextMenuRef = useRef<HTMLDivElement>(null)
    const playlistSubmenuTimeout = useRef<number | null>(null)
    const genreSubmenuTimeout = useRef<number | null>(null)
    const analyzeSubmenuTimeout = useRef<number | null>(null)

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

    // Row selection state
    const [selectedRowId, setSelectedRowId] = useState<number | null>(null)

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

    // Context menu (right-click on track row)
    const [contextMenu, setContextMenu] = useState<{
      track: Track
      x: number
      y: number
    } | null>(null)

    // Submenu for "Add to Playlist"
    const [playlistSubmenu, setPlaylistSubmenu] = useState<{
      visible: boolean
      x: number
      y: number
    }>({ visible: false, x: 0, y: 0 })

    // Submenu for "Set Genre"
    const [genreSubmenu, setGenreSubmenu] = useState<{
      visible: boolean
      x: number
      y: number
    }>({ visible: false, x: 0, y: 0 })

    // Submenu for "Analyze"
    const [, setAnalyzeSubmenu] = useState<{
      visible: boolean
      x: number
      y: number
    }>({ visible: false, x: 0, y: 0 })

    // Custom genre input state
    const [customGenreInput, setCustomGenreInput] = useState<{
      visible: boolean
      track: Track | null
      value: string
    }>({ visible: false, track: null, value: '' })

    // Comment editor state
    const [commentInput, setCommentInput] = useState<{
      visible: boolean
      track: Track | null
      value: string
    }>({ visible: false, track: null, value: '' })

    // Get only actual playlists (not folders) for the submenu
    const actualPlaylists = useMemo(
      () => playlists.filter((p) => p.playlist_type !== 'folder'),
      [playlists],
    )

    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (!contextMenu || !contextMenuRef.current) return
        const target = e.target as Node
        // Don't close if clicking inside main menu, any submenu, or custom genre modal
        const isInsideMenu =
          target instanceof Element &&
          (target.closest('.context-menu') !== null ||
            target.closest('.context-submenu') !== null ||
            target.closest('.modal-overlay') !== null)
        if (!isInsideMenu) {
          setContextMenu(null)
          setPlaylistSubmenu({ visible: false, x: 0, y: 0 })
          setGenreSubmenu({ visible: false, x: 0, y: 0 })
          setAnalyzeSubmenu({ visible: false, x: 0, y: 0 })
        }
      }
      if (contextMenu) {
        document.addEventListener('mousedown', handleClickOutside)
        return () =>
          document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [contextMenu])

    // Close submenus when context menu closes
    useEffect(() => {
      if (!contextMenu) {
        // Clear any pending timeouts
        if (playlistSubmenuTimeout.current) {
          clearTimeout(playlistSubmenuTimeout.current)
          playlistSubmenuTimeout.current = null
        }
        if (genreSubmenuTimeout.current) {
          clearTimeout(genreSubmenuTimeout.current)
          genreSubmenuTimeout.current = null
        }
        if (analyzeSubmenuTimeout.current) {
          clearTimeout(analyzeSubmenuTimeout.current)
          analyzeSubmenuTimeout.current = null
        }
        setPlaylistSubmenu({ visible: false, x: 0, y: 0 })
        setGenreSubmenu({ visible: false, x: 0, y: 0 })
        setAnalyzeSubmenu({ visible: false, x: 0, y: 0 })
      }
    }, [contextMenu])

    // Cleanup timeouts on unmount
    useEffect(() => {
      return () => {
        if (playlistSubmenuTimeout.current) {
          clearTimeout(playlistSubmenuTimeout.current)
        }
        if (genreSubmenuTimeout.current) {
          clearTimeout(genreSubmenuTimeout.current)
        }
        if (analyzeSubmenuTimeout.current) {
          clearTimeout(analyzeSubmenuTimeout.current)
        }
      }
    }, [])

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

    const HEADER_HEIGHT = 30

    const virtualizer = useVirtualizer({
      count: sortedTracks.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 46,
      overscan: 10,
      scrollMargin: HEADER_HEIGHT,
    })

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
            )}
          </span>
        </div>

        {/* Scroll area: header + body scroll together */}
        <div
          ref={parentRef}
          className="track-table-scroll-area"
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
                    className={`track-table-row data-row ${isPlayingTrack ? 'data-row--playing' : ''} ${selectedRowId === track.id ? 'data-row--selected' : ''}`}
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
                    onClick={() => {
                      setSelectedRowId(track.id)
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
                      setContextMenu({
                        track,
                        x: e.clientX,
                        y: e.clientY,
                      })
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
                        <TrackCover key={track.id} track={track} />
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

        {/* Right-click context menu */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 9999,
            }}
          >
            {/* Delete from Playlist — only when viewing a playlist */}
            {selectedPlaylistId != null && onRemoveFromPlaylist && (
              <button
                type="button"
                className="context-menu-item context-menu-item-danger"
                onClick={() => {
                  onRemoveFromPlaylist(contextMenu.track)
                  setContextMenu(null)
                }}
              >
                <Icon name="Trash2" size={16} className="context-menu-icon" />
                Delete from playlist
              </button>
            )}

            {/* Add to Playlist option */}
            {onAddToPlaylist && actualPlaylists.length > 0 && (
              <div
                className="context-menu-item context-menu-item-submenu"
                onMouseEnter={(e) => {
                  // Cancel any pending close timeout
                  if (playlistSubmenuTimeout.current) {
                    clearTimeout(playlistSubmenuTimeout.current)
                    playlistSubmenuTimeout.current = null
                  }
                  const rect = e.currentTarget.getBoundingClientRect()
                  setPlaylistSubmenu({
                    visible: true,
                    x: rect.right,
                    y: rect.top,
                  })
                }}
                onMouseLeave={() => {
                  // Small delay to allow moving to submenu
                  playlistSubmenuTimeout.current = setTimeout(() => {
                    setPlaylistSubmenu({ visible: false, x: 0, y: 0 })
                  }, 150)
                }}
              >
                <Icon name="ListPlus" size={16} className="context-menu-icon" />
                Add to Playlist
                <Icon
                  name="ChevronRight"
                  size={14}
                  className="context-menu-arrow"
                />
              </div>
            )}

            {onAddToPlaylist && actualPlaylists.length === 0 && (
              <div className="context-menu-item context-menu-item-disabled">
                <Icon name="ListPlus" size={16} className="context-menu-icon" />
                Add to Playlist
                <span className="context-menu-hint">(no playlists)</span>
              </div>
            )}

            {onAnalyzeTrack && (
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  onAnalyzeTrack(contextMenu.track)
                  setContextMenu(null)
                }}
              >
                <Icon name="Zap" size={16} className="context-menu-icon" />
                Analyze BPM & Key
              </button>
            )}

            {/* Set Genre option */}
            {onSetGenre && (
              <div
                className="context-menu-item context-menu-item-submenu"
                onMouseEnter={(e) => {
                  // Cancel any pending close timeout
                  if (genreSubmenuTimeout.current) {
                    clearTimeout(genreSubmenuTimeout.current)
                    genreSubmenuTimeout.current = null
                  }
                  const rect = e.currentTarget.getBoundingClientRect()
                  setGenreSubmenu({
                    visible: true,
                    x: rect.right,
                    y: rect.top,
                  })
                }}
                onMouseLeave={() => {
                  genreSubmenuTimeout.current = setTimeout(() => {
                    setGenreSubmenu({ visible: false, x: 0, y: 0 })
                  }, 150)
                }}
              >
                <Icon name="Tag" size={16} className="context-menu-icon" />
                Set Genre
                {contextMenu.track.genre && (
                  <span className="context-menu-hint">
                    ({contextMenu.track.genre})
                  </span>
                )}
                <Icon
                  name="ChevronRight"
                  size={14}
                  className="context-menu-arrow"
                />
              </div>
            )}

            {/* Clear Genre option */}
            {onClearGenre && contextMenu.track.genre && (
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  onClearGenre(contextMenu.track)
                  setContextMenu(null)
                }}
              >
                <Icon name="X" size={16} className="context-menu-icon" />
                Clear Genre
              </button>
            )}

            {/* Add / Edit Comment option */}
            {onUpdateTrack && (
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  setCommentInput({
                    visible: true,
                    track: contextMenu.track,
                    value: contextMenu.track.comment || '',
                  })
                  setContextMenu(null)
                }}
              >
                <Icon
                  name="MessageSquare"
                  size={16}
                  className="context-menu-icon"
                />
                {contextMenu.track.comment ? 'Edit Comment' : 'Add Comment'}
              </button>
            )}

            {/* Generate AI Playlist */}
            {onGenerateAIPlaylist && (
              <>
                <div className="context-menu-separator" />
                <button
                  type="button"
                  className="context-menu-item"
                  onClick={() => {
                    onGenerateAIPlaylist(contextMenu.track)
                    setContextMenu(null)
                  }}
                >
                  <Icon
                    name="Sparkles"
                    size={16}
                    className="context-menu-icon"
                  />
                  Generate AI Playlist
                </button>
              </>
            )}
          </div>
        )}

        {/* Playlist submenu */}
        {contextMenu &&
          playlistSubmenu.visible &&
          actualPlaylists.length > 0 && (
            <div
              className="context-menu context-submenu"
              style={{
                position: 'fixed',
                top: playlistSubmenu.y,
                left: playlistSubmenu.x,
                zIndex: 10000,
              }}
              onMouseEnter={() => {
                // Cancel any pending close timeout
                if (playlistSubmenuTimeout.current) {
                  clearTimeout(playlistSubmenuTimeout.current)
                  playlistSubmenuTimeout.current = null
                }
                setPlaylistSubmenu((prev) => ({ ...prev, visible: true }))
              }}
              onMouseLeave={() =>
                setPlaylistSubmenu({ visible: false, x: 0, y: 0 })
              }
            >
              {actualPlaylists.map((playlist) => (
                <button
                  key={playlist.id}
                  type="button"
                  className="context-menu-item"
                  onClick={() => {
                    onAddToPlaylist?.(contextMenu.track, playlist.id)
                    setContextMenu(null)
                    setPlaylistSubmenu({ visible: false, x: 0, y: 0 })
                  }}
                >
                  <Icon
                    name="ListMusic"
                    size={16}
                    className="context-menu-icon"
                  />
                  {playlist.name}
                </button>
              ))}
            </div>
          )}

        {/* Genre submenu */}
        {contextMenu && genreSubmenu.visible && onSetGenre && (
          <div
            className="context-menu context-submenu"
            style={{
              position: 'fixed',
              top: genreSubmenu.y,
              left: genreSubmenu.x,
              zIndex: 10000,
            }}
            onMouseEnter={() => {
              // Cancel any pending close timeout
              if (genreSubmenuTimeout.current) {
                clearTimeout(genreSubmenuTimeout.current)
                genreSubmenuTimeout.current = null
              }
              setGenreSubmenu((prev) => ({ ...prev, visible: true }))
            }}
            onMouseLeave={() => setGenreSubmenu({ visible: false, x: 0, y: 0 })}
          >
            {genreDefinitions.length === 0 && (
              <div className="context-menu-item context-menu-item-disabled">
                <Icon name="Music" size={16} className="context-menu-icon" />
                No genres defined
                <span className="context-menu-hint">(use Custom)</span>
              </div>
            )}

            {genreDefinitions.map((genre) => {
              const isSelected = contextMenu.track.genre === genre.name
              return (
                <button
                  key={genre.id}
                  type="button"
                  className={`context-menu-item ${isSelected ? 'context-menu-item-active' : ''}`}
                  onClick={() => {
                    onSetGenre(contextMenu.track, genre.name)
                    setContextMenu(null)
                    setGenreSubmenu({ visible: false, x: 0, y: 0 })
                  }}
                >
                  {genre.color ? (
                    <span
                      className="context-menu-icon"
                      style={{ color: genre.color }}
                    >
                      ●
                    </span>
                  ) : (
                    <Icon
                      name="Music"
                      size={16}
                      className="context-menu-icon"
                    />
                  )}
                  {genre.name}
                  {isSelected && (
                    <Icon
                      name="Check"
                      size={14}
                      className="context-menu-checkmark"
                    />
                  )}
                </button>
              )
            })}

            {genreDefinitions.length > 0 && (
              <div className="context-menu-separator" />
            )}

            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                setCustomGenreInput({
                  visible: true,
                  track: contextMenu.track,
                  value: contextMenu.track.genre || '',
                })
                setContextMenu(null)
                setGenreSubmenu({ visible: false, x: 0, y: 0 })
              }}
            >
              <Icon name="Pencil" size={16} className="context-menu-icon" />
              Custom...
            </button>
          </div>
        )}


        {/* Custom Genre Input Modal */}
        {customGenreInput.visible && customGenreInput.track && onSetGenre && (
          <div
            className="modal-overlay"
            onClick={() =>
              setCustomGenreInput({ visible: false, track: null, value: '' })
            }
          >
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Set Genre</h3>
              <p className="modal-subtitle">
                {customGenreInput.track.title || 'Untitled'}
              </p>
              <input
                type="text"
                className="modal-input"
                placeholder="Enter genre name..."
                value={customGenreInput.value}
                onChange={(e) =>
                  setCustomGenreInput((prev) => ({
                    ...prev,
                    value: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customGenreInput.value.trim()) {
                    onSetGenre(
                      customGenreInput.track!,
                      customGenreInput.value.trim(),
                    )
                    setCustomGenreInput({
                      visible: false,
                      track: null,
                      value: '',
                    })
                  } else if (e.key === 'Escape') {
                    setCustomGenreInput({
                      visible: false,
                      track: null,
                      value: '',
                    })
                  }
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button modal-button-secondary"
                  onClick={() =>
                    setCustomGenreInput({
                      visible: false,
                      track: null,
                      value: '',
                    })
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={() => {
                    if (customGenreInput.value.trim()) {
                      onSetGenre(
                        customGenreInput.track!,
                        customGenreInput.value.trim(),
                      )
                      setCustomGenreInput({
                        visible: false,
                        track: null,
                        value: '',
                      })
                    }
                  }}
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
          <div
            className="modal-overlay"
            onClick={() =>
              setCommentInput({ visible: false, track: null, value: '' })
            }
          >
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
                    const trimmed = commentInput.value.trim()
                    onUpdateTrack({
                      ...commentInput.track!,
                      comment: trimmed ? trimmed : undefined,
                    })
                    setCommentInput({
                      visible: false,
                      track: null,
                      value: '',
                    })
                  } else if (e.key === 'Escape') {
                    setCommentInput({
                      visible: false,
                      track: null,
                      value: '',
                    })
                  }
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button modal-button-secondary"
                  onClick={() =>
                    setCommentInput({
                      visible: false,
                      track: null,
                      value: '',
                    })
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-button modal-button-primary"
                  onClick={() => {
                    const trimmed = commentInput.value.trim()
                    onUpdateTrack({
                      ...commentInput.track!,
                      comment: trimmed ? trimmed : undefined,
                    })
                    setCommentInput({
                      visible: false,
                      track: null,
                      value: '',
                    })
                  }}
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
