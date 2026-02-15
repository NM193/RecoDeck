// Virtualized track table component with search and sort
// Search: frontend-side filtering across all text fields
// Sort: click column header to sort asc, click again for desc

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef } from "react";
import type { Track, Playlist } from "../types/track";
import { usePlayerStore } from "../store/playerStore";
import { Icon } from "./Icon";

// --- Sort types ---

type SortColumn =
  | "title"
  | "artist"
  | "album"
  | "bpm"
  | "key"
  | "genre"
  | "duration"
  | "format";

type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

// --- Component ---

interface TrackTableProps {
  tracks: Track[];
  playlists?: Playlist[];
  keyNotation?: "camelot" | "openkey";
  onTrackClick?: (track: Track) => void;
  onTrackDoubleClick?: (track: Track, sortedTracks: Track[], trackIndex: number) => void;
  onAnalyzeTrack?: (track: Track) => void;
  onAnalyzeBpm?: (track: Track) => void;
  onAnalyzeKey?: (track: Track) => void;
  onAddToPlaylist?: (track: Track, playlistId: number) => void;
  onSetGenre?: (track: Track, genre: string) => void;
  onClearGenre?: (track: Track) => void;
  genreDefinitions?: Array<{ id: number; name: string; color?: string }>;
  onLoadMore?: () => void;
  hasMoreTracks?: boolean;
  isLoadingMore?: boolean;
}

export interface TrackTableRef {
  scrollToCurrentTrack: () => void;
}

// Convert Camelot notation to Open Key notation
function camelotToOpenKey(camelot: string): string {
  // Simple conversion: replace 'A' with 'm' (minor) and 'B' with 'd' (major)
  if (camelot.endsWith('A')) {
    return camelot.slice(0, -1) + 'm';
  } else if (camelot.endsWith('B')) {
    return camelot.slice(0, -1) + 'd';
  }
  return camelot;
}

export const TrackTable = forwardRef<TrackTableRef, TrackTableProps>(function TrackTable({
  tracks,
  playlists = [],
  keyNotation = "camelot",
  onTrackClick,
  onTrackDoubleClick,
  onAnalyzeTrack,
  onAnalyzeBpm,
  onAnalyzeKey,
  onAddToPlaylist,
  onSetGenre,
  onClearGenre,
  genreDefinitions = [],
  onLoadMore,
  hasMoreTracks = false,
  isLoadingMore = false,
}, ref) {
  const parentRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const playlistSubmenuTimeout = useRef<number | null>(null);
  const genreSubmenuTimeout = useRef<number | null>(null);
  const analyzeSubmenuTimeout = useRef<number | null>(null);

  // Player store subscription for current track
  const currentTrack = usePlayerStore((state) => state.currentTrack);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Context menu (right-click on track row)
  const [contextMenu, setContextMenu] = useState<{
    track: Track;
    x: number;
    y: number;
  } | null>(null);

  // Submenu for "Add to Playlist"
  const [playlistSubmenu, setPlaylistSubmenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // Submenu for "Set Genre"
  const [genreSubmenu, setGenreSubmenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // Submenu for "Analyze"
  const [analyzeSubmenu, setAnalyzeSubmenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({ visible: false, x: 0, y: 0 });

  // Custom genre input state
  const [customGenreInput, setCustomGenreInput] = useState<{
    visible: boolean;
    track: Track | null;
    value: string;
  }>({ visible: false, track: null, value: "" });

  // Get only actual playlists (not folders) for the submenu
  const actualPlaylists = useMemo(
    () => playlists.filter((p) => p.playlist_type !== "folder"),
    [playlists]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        contextMenu &&
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
        setPlaylistSubmenu({ visible: false, x: 0, y: 0 });
        setGenreSubmenu({ visible: false, x: 0, y: 0 });
        setAnalyzeSubmenu({ visible: false, x: 0, y: 0 });
      }
    }
    if (contextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [contextMenu]);

  // Close submenus when context menu closes
  useEffect(() => {
    if (!contextMenu) {
      // Clear any pending timeouts
      if (playlistSubmenuTimeout.current) {
        clearTimeout(playlistSubmenuTimeout.current);
        playlistSubmenuTimeout.current = null;
      }
      if (genreSubmenuTimeout.current) {
        clearTimeout(genreSubmenuTimeout.current);
        genreSubmenuTimeout.current = null;
      }
      if (analyzeSubmenuTimeout.current) {
        clearTimeout(analyzeSubmenuTimeout.current);
        analyzeSubmenuTimeout.current = null;
      }
      setPlaylistSubmenu({ visible: false, x: 0, y: 0 });
      setGenreSubmenu({ visible: false, x: 0, y: 0 });
      setAnalyzeSubmenu({ visible: false, x: 0, y: 0 });
    }
  }, [contextMenu]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (playlistSubmenuTimeout.current) {
        clearTimeout(playlistSubmenuTimeout.current);
      }
      if (genreSubmenuTimeout.current) {
        clearTimeout(genreSubmenuTimeout.current);
      }
      if (analyzeSubmenuTimeout.current) {
        clearTimeout(analyzeSubmenuTimeout.current);
      }
    };
  }, []);

  // Sort state — default: sort by title ascending
  const [sort, setSort] = useState<SortState>({
    column: "title",
    direction: "asc",
  });

  // --- Search: filter tracks by query across all text fields ---
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;

    const query = searchQuery.toLowerCase().trim();

    return tracks.filter((track) => {
      const fields = [
        track.title,
        track.artist,
        track.album,
        track.label,
        track.comment,
        track.file_path,
        track.genre,
      ];
      return fields.some(
        (field) => field != null && field.toLowerCase().includes(query)
      );
    });
  }, [tracks, searchQuery]);

  // --- Sort: order filtered tracks by selected column ---
  const sortedTracks = useMemo(() => {
    const sorted = [...filteredTracks];
    const { column, direction } = sort;
    const dir = direction === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      let valA: string | number | undefined;
      let valB: string | number | undefined;

      switch (column) {
        case "title":
          valA = a.title?.toLowerCase() ?? "";
          valB = b.title?.toLowerCase() ?? "";
          break;
        case "artist":
          valA = a.artist?.toLowerCase() ?? "";
          valB = b.artist?.toLowerCase() ?? "";
          break;
        case "album":
          valA = a.album?.toLowerCase() ?? "";
          valB = b.album?.toLowerCase() ?? "";
          break;
        case "bpm":
          valA = a.bpm ?? 0;
          valB = b.bpm ?? 0;
          break;
        case "key":
          valA = (a.musical_key ?? "").toLowerCase();
          valB = (b.musical_key ?? "").toLowerCase();
          break;
        case "genre":
          valA = (a.genre ?? "").toLowerCase();
          valB = (b.genre ?? "").toLowerCase();
          break;
        case "duration":
          valA = a.duration_ms ?? 0;
          valB = b.duration_ms ?? 0;
          break;
        case "format":
          valA = a.file_format?.toLowerCase() ?? "";
          valB = b.file_format?.toLowerCase() ?? "";
          break;
      }

      // Compare: strings use localeCompare, numbers use subtraction
      if (typeof valA === "string" && typeof valB === "string") {
        // Push empty strings to the bottom regardless of sort direction
        if (valA === "" && valB !== "") return 1;
        if (valA !== "" && valB === "") return -1;
        return valA.localeCompare(valB) * dir;
      }

      if (typeof valA === "number" && typeof valB === "number") {
        // Push 0/empty to the bottom regardless of sort direction
        if (valA === 0 && valB !== 0) return 1;
        if (valA !== 0 && valB === 0) return -1;
        return (valA - valB) * dir;
      }

      return 0;
    });

    return sorted;
  }, [filteredTracks, sort]);

  // Handle column header click — toggle sort
  const handleSort = (column: SortColumn) => {
    setSort((prev) => {
      if (prev.column === column) {
        // Same column: toggle direction
        return {
          column,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      // New column: start ascending
      return { column, direction: "asc" };
    });
  };

  // Render sort indicator arrow
  const sortIndicator = (column: SortColumn) => {
    if (sort.column !== column) return null;
    return (
      <span className="sort-indicator">
        {sort.direction === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const virtualizer = useVirtualizer({
    count: sortedTracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  // Expose scroll to current track method via ref
  useImperativeHandle(ref, () => ({
    scrollToCurrentTrack: () => {
      if (!currentTrack || !parentRef.current) return;

      // Find the current track in the sorted tracks
      const index = sortedTracks.findIndex(
        t => t.id === currentTrack.id && t.file_path === currentTrack.file_path
      );

      if (index === -1) {
        console.warn('[TrackTable] Current track not found in sorted tracks');
        return;
      }

      console.log(`[TrackTable] Scrolling to track at index ${index}: ${currentTrack.title}`);

      // Scroll to the track using the virtualizer
      virtualizer.scrollToIndex(index, {
        align: 'center',
        behavior: 'smooth',
      });

      // Optional: Add a brief flash/highlight effect
      setTimeout(() => {
        const element = parentRef.current?.querySelector(`[data-index="${index}"]`) as HTMLElement;
        if (element) {
          element.style.transition = 'background-color 0.3s ease';
          element.style.backgroundColor = 'rgba(var(--accent-rgb), 0.3)';
          setTimeout(() => {
            element.style.backgroundColor = '';
          }, 600);
        }
      }, 100);
    },
  }), [currentTrack, sortedTracks, virtualizer]);

  // Lazy loading: detect when scrolled near bottom
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent || !onLoadMore || !hasMoreTracks || isLoadingMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = parent;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // Load more when scrolled 80% down
      if (scrollPercentage > 0.8) {
        onLoadMore();
      }
    };

    parent.addEventListener("scroll", handleScroll);
    return () => parent.removeEventListener("scroll", handleScroll);
  }, [onLoadMore, hasMoreTracks, isLoadingMore]);

  // Format duration from milliseconds to MM:SS
  const formatDuration = (ms?: number) => {
    if (!ms) return "--:--";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="track-table-container">
      {/* Search bar — integrated into header area */}
      <div className="track-table-search">
        <div className="search-input-wrapper">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search tracks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Column headers — clickable for sorting */}
      <div className="track-table-header">
        <div className="track-table-row header-row">
          <div
            className={`table-cell cell-title sortable ${sort.column === "title" ? "sorted" : ""}`}
            onClick={() => handleSort("title")}
          >
            Title {sortIndicator("title")}
          </div>
          <div
            className={`table-cell cell-artist sortable ${sort.column === "artist" ? "sorted" : ""}`}
            onClick={() => handleSort("artist")}
          >
            Artist {sortIndicator("artist")}
          </div>
          <div
            className={`table-cell cell-album sortable ${sort.column === "album" ? "sorted" : ""}`}
            onClick={() => handleSort("album")}
          >
            Album {sortIndicator("album")}
          </div>
          <div
            className={`table-cell cell-bpm sortable ${sort.column === "bpm" ? "sorted" : ""}`}
            onClick={() => handleSort("bpm")}
          >
            BPM {sortIndicator("bpm")}
          </div>
          <div
            className={`table-cell cell-key sortable ${sort.column === "key" ? "sorted" : ""}`}
            onClick={() => handleSort("key")}
          >
            Key {sortIndicator("key")}
          </div>
          <div
            className={`table-cell cell-genre sortable ${sort.column === "genre" ? "sorted" : ""}`}
            onClick={() => handleSort("genre")}
          >
            Genre {sortIndicator("genre")}
          </div>
          <div
            className={`table-cell cell-duration sortable ${sort.column === "duration" ? "sorted" : ""}`}
            onClick={() => handleSort("duration")}
          >
            Duration {sortIndicator("duration")}
          </div>
          <div
            className={`table-cell cell-format sortable ${sort.column === "format" ? "sorted" : ""}`}
            onClick={() => handleSort("format")}
          >
            Format {sortIndicator("format")}
          </div>
        </div>
      </div>

      {/* Virtualized body */}
      <div
        ref={parentRef}
        className="track-table-body"
        style={{
          flex: 1,
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const track = sortedTracks[virtualRow.index];
            // Use both ID and file path for maximum reliability when identifying the playing track
            const isPlayingTrack = currentTrack != null &&
              track.id === currentTrack.id &&
              track.file_path === currentTrack.file_path;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                className={`track-table-row data-row ${isPlayingTrack ? 'data-row--playing' : ''}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onTrackClick?.(track)}
                onDoubleClick={(e) => {
                  e.stopPropagation(); // Prevent event bubbling
                  console.log('[TrackTable] Double-click on track:', {
                    id: track.id,
                    title: track.title,
                    file_path: track.file_path,
                    virtualIndex: virtualRow.index,
                    actualTrack: track,
                    trackAtIndex: sortedTracks[virtualRow.index],
                    indexMatches: sortedTracks[virtualRow.index] === track,
                    sortedTracksLength: sortedTracks.length
                  });
                  // Pass the sorted/filtered tracks array and the actual index so the queue respects the current view
                  onTrackDoubleClick?.(track, sortedTracks, virtualRow.index);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    track,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
              >
                <div
                  className="table-cell cell-title"
                  title={track.title || track.file_path}
                >
                  {track.title || <span className="text-muted">Untitled</span>}
                </div>
                <div className="table-cell cell-artist" title={track.artist}>
                  {track.artist || (
                    <span className="text-muted">Unknown</span>
                  )}
                </div>
                <div className="table-cell cell-album" title={track.album}>
                  {track.album || <span className="text-muted">—</span>}
                </div>
                <div className="table-cell cell-bpm">
                  {track.bpm ? track.bpm.toFixed(2) : "—"}
                </div>
                <div className="table-cell cell-key" title={track.key_confidence != null ? `${track.musical_key ?? "—"} (${Math.round((track.key_confidence ?? 0) * 100)}%)` : undefined}>
                  {track.musical_key ? (keyNotation === "openkey" ? camelotToOpenKey(track.musical_key) : track.musical_key) : "—"}
                </div>
                <div className="table-cell cell-genre" title={track.genre}>
                  {track.genre || <span className="text-muted">—</span>}
                </div>
                <div className="table-cell cell-duration">
                  {formatDuration(track.duration_ms)}
                </div>
                <div className="table-cell cell-format">
                  {track.file_format?.toUpperCase() || "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
          }}
        >
          {/* Add to Playlist option */}
          {onAddToPlaylist && actualPlaylists.length > 0 && (
            <div
              className="context-menu-item context-menu-item-submenu"
              onMouseEnter={(e) => {
                // Cancel any pending close timeout
                if (playlistSubmenuTimeout.current) {
                  clearTimeout(playlistSubmenuTimeout.current);
                  playlistSubmenuTimeout.current = null;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                setPlaylistSubmenu({
                  visible: true,
                  x: rect.right,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => {
                // Small delay to allow moving to submenu
                playlistSubmenuTimeout.current = setTimeout(() => {
                  setPlaylistSubmenu({ visible: false, x: 0, y: 0 });
                }, 150);
              }}
            >
              <Icon name="ListPlus" size={16} className="context-menu-icon" />
              Add to Playlist
              <Icon name="ChevronRight" size={14} className="context-menu-arrow" />
            </div>
          )}

          {onAddToPlaylist && actualPlaylists.length === 0 && (
            <div className="context-menu-item context-menu-item-disabled">
              <Icon name="ListPlus" size={16} className="context-menu-icon" />
              Add to Playlist
              <span className="context-menu-hint">(no playlists)</span>
            </div>
          )}

          {(onAnalyzeTrack || onAnalyzeBpm || onAnalyzeKey) && (
            <div
              className="context-menu-item context-menu-item-submenu"
              onMouseEnter={(e) => {
                // Cancel any pending close timeout
                if (analyzeSubmenuTimeout.current) {
                  clearTimeout(analyzeSubmenuTimeout.current);
                  analyzeSubmenuTimeout.current = null;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                setAnalyzeSubmenu({
                  visible: true,
                  x: rect.right,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => {
                analyzeSubmenuTimeout.current = setTimeout(() => {
                  setAnalyzeSubmenu({ visible: false, x: 0, y: 0 });
                }, 150);
              }}
            >
              <Icon name="Zap" size={16} className="context-menu-icon" />
              Analyze
              <Icon name="ChevronRight" size={14} className="context-menu-arrow" />
            </div>
          )}

          {/* Set Genre option */}
          {onSetGenre && (
            <div
              className="context-menu-item context-menu-item-submenu"
              onMouseEnter={(e) => {
                // Cancel any pending close timeout
                if (genreSubmenuTimeout.current) {
                  clearTimeout(genreSubmenuTimeout.current);
                  genreSubmenuTimeout.current = null;
                }
                const rect = e.currentTarget.getBoundingClientRect();
                setGenreSubmenu({
                  visible: true,
                  x: rect.right,
                  y: rect.top,
                });
              }}
              onMouseLeave={() => {
                genreSubmenuTimeout.current = setTimeout(() => {
                  setGenreSubmenu({ visible: false, x: 0, y: 0 });
                }, 150);
              }}
            >
              <Icon name="Tag" size={16} className="context-menu-icon" />
              Set Genre
              {contextMenu.track.genre && (
                <span className="context-menu-hint">({contextMenu.track.genre})</span>
              )}
              <Icon name="ChevronRight" size={14} className="context-menu-arrow" />
            </div>
          )}

          {/* Clear Genre option */}
          {onClearGenre && contextMenu.track.genre && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onClearGenre(contextMenu.track);
                setContextMenu(null);
              }}
            >
              <Icon name="X" size={16} className="context-menu-icon" />
              Clear Genre
            </button>
          )}
        </div>
      )}

      {/* Playlist submenu */}
      {contextMenu && playlistSubmenu.visible && actualPlaylists.length > 0 && (
        <div
          className="context-menu context-submenu"
          style={{
            position: "fixed",
            top: playlistSubmenu.y,
            left: playlistSubmenu.x,
            zIndex: 10000,
          }}
          onMouseEnter={() => {
            // Cancel any pending close timeout
            if (playlistSubmenuTimeout.current) {
              clearTimeout(playlistSubmenuTimeout.current);
              playlistSubmenuTimeout.current = null;
            }
            setPlaylistSubmenu((prev) => ({ ...prev, visible: true }));
          }}
          onMouseLeave={() => setPlaylistSubmenu({ visible: false, x: 0, y: 0 })}
        >
          {actualPlaylists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              className="context-menu-item"
              onClick={() => {
                onAddToPlaylist?.(contextMenu.track, playlist.id);
                setContextMenu(null);
                setPlaylistSubmenu({ visible: false, x: 0, y: 0 });
              }}
            >
              <Icon name="ListMusic" size={16} className="context-menu-icon" />
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
            position: "fixed",
            top: genreSubmenu.y,
            left: genreSubmenu.x,
            zIndex: 10000,
          }}
          onMouseEnter={() => {
            // Cancel any pending close timeout
            if (genreSubmenuTimeout.current) {
              clearTimeout(genreSubmenuTimeout.current);
              genreSubmenuTimeout.current = null;
            }
            setGenreSubmenu((prev) => ({ ...prev, visible: true }));
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
            const isSelected = contextMenu.track.genre === genre.name;
            return (
              <button
                key={genre.id}
                type="button"
                className={`context-menu-item ${isSelected ? "context-menu-item-active" : ""}`}
                onClick={() => {
                  onSetGenre(contextMenu.track, genre.name);
                  setContextMenu(null);
                  setGenreSubmenu({ visible: false, x: 0, y: 0 });
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
                  <Icon name="Music" size={16} className="context-menu-icon" />
                )}
                {genre.name}
                {isSelected && <Icon name="Check" size={14} className="context-menu-checkmark" />}
              </button>
            );
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
                value: contextMenu.track.genre || "",
              });
              setContextMenu(null);
              setGenreSubmenu({ visible: false, x: 0, y: 0 });
            }}
          >
            <Icon name="Pencil" size={16} className="context-menu-icon" />
            Custom...
          </button>
        </div>
      )}

      {/* Analyze submenu */}
      {contextMenu && analyzeSubmenu.visible && (onAnalyzeTrack || onAnalyzeBpm || onAnalyzeKey) && (
        <div
          className="context-menu context-submenu"
          style={{
            position: "fixed",
            top: analyzeSubmenu.y,
            left: analyzeSubmenu.x,
            zIndex: 10000,
          }}
          onMouseEnter={() => {
            // Cancel any pending close timeout
            if (analyzeSubmenuTimeout.current) {
              clearTimeout(analyzeSubmenuTimeout.current);
              analyzeSubmenuTimeout.current = null;
            }
            setAnalyzeSubmenu((prev) => ({ ...prev, visible: true }));
          }}
          onMouseLeave={() => setAnalyzeSubmenu({ visible: false, x: 0, y: 0 })}
        >
          {onAnalyzeTrack && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onAnalyzeTrack(contextMenu.track);
                setContextMenu(null);
                setAnalyzeSubmenu({ visible: false, x: 0, y: 0 });
              }}
            >
              <Icon name="Zap" size={16} className="context-menu-icon" />
              BPM & Key
            </button>
          )}

          {onAnalyzeBpm && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onAnalyzeBpm(contextMenu.track);
                setContextMenu(null);
                setAnalyzeSubmenu({ visible: false, x: 0, y: 0 });
              }}
            >
              <Icon name="Activity" size={16} className="context-menu-icon" />
              BPM Only
            </button>
          )}

          {onAnalyzeKey && (
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                onAnalyzeKey(contextMenu.track);
                setContextMenu(null);
                setAnalyzeSubmenu({ visible: false, x: 0, y: 0 });
              }}
            >
              <Icon name="Music2" size={16} className="context-menu-icon" />
              Key Only
            </button>
          )}
        </div>
      )}

      {/* Footer with track count + search result info */}
      <div className="track-table-footer">
        {searchQuery ? (
          <span>
            {sortedTracks.length} of {tracks.length} tracks
            {sort.column && (
              <span className="footer-sort-info">
                {" "}
                · sorted by {sort.column} {sort.direction === "asc" ? "↑" : "↓"}
              </span>
            )}
          </span>
        ) : (
          <span>
            {tracks.length} tracks
            {sort.column && (
              <span className="footer-sort-info">
                {" "}
                · sorted by {sort.column} {sort.direction === "asc" ? "↑" : "↓"}
              </span>
            )}
            {isLoadingMore && (
              <span className="footer-loading-info"> · Loading more...</span>
            )}
            {hasMoreTracks && !isLoadingMore && (
              <span className="footer-loading-info"> · Scroll for more</span>
            )}
          </span>
        )}
      </div>

      {/* Custom Genre Input Modal */}
      {customGenreInput.visible && customGenreInput.track && onSetGenre && (
        <div
          className="modal-overlay"
          onClick={() => setCustomGenreInput({ visible: false, track: null, value: "" })}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Set Genre</h3>
            <p className="modal-subtitle">
              {customGenreInput.track.title || "Untitled"}
            </p>
            <input
              type="text"
              className="modal-input"
              placeholder="Enter genre name..."
              value={customGenreInput.value}
              onChange={(e) =>
                setCustomGenreInput((prev) => ({ ...prev, value: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && customGenreInput.value.trim()) {
                  onSetGenre(customGenreInput.track!, customGenreInput.value.trim());
                  setCustomGenreInput({ visible: false, track: null, value: "" });
                } else if (e.key === "Escape") {
                  setCustomGenreInput({ visible: false, track: null, value: "" });
                }
              }}
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button modal-button-secondary"
                onClick={() => setCustomGenreInput({ visible: false, track: null, value: "" })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-button modal-button-primary"
                onClick={() => {
                  if (customGenreInput.value.trim()) {
                    onSetGenre(customGenreInput.track!, customGenreInput.value.trim());
                    setCustomGenreInput({ visible: false, track: null, value: "" });
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
    </div>
  );
});
