// Mobile track list — search + infinite scroll list

import { useState, useEffect, useCallback, useRef } from "react";
import { httpApi } from "../../src/lib/http-api";
import type { Track } from "../../src/types/track";

interface MobileTrackListProps {
  onPlayTrack: (track: Track, tracks: Track[], index: number) => void;
  playlistId?: number;
  playlistName?: string;
}

function formatDuration(ms?: number): string {
  if (!ms) return "--:--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function MobileTrackList({
  onPlayTrack,
  playlistId,
  playlistName,
}: MobileTrackListProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 50;
  const isPlaylistMode = playlistId != null;

  // Load initial tracks
  useEffect(() => {
    if (isPlaylistMode && playlistId != null) {
      let cancelled = false;
      setLoading(true);
      httpApi
        .getPlaylistTracks(playlistId)
        .then((result) => {
          if (!cancelled) {
            setTracks(result);
            setHasMore(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error("Failed to load playlist:", err);
            setTracks([]);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    } else if (!isPlaylistMode) {
      loadTracks(true);
    }
  }, [playlistId]);

  // Search debounce (only when not in playlist mode)
  useEffect(() => {
    if (isPlaylistMode) return;
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchTracks();
      } else {
        loadTracks(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isPlaylistMode]);

  async function loadTracks(reset: boolean) {
    if (loading) return;
    setLoading(true);
    try {
      const newOffset = reset ? 0 : offset;
      const result = await httpApi.getTracksPaginated(PAGE_SIZE, newOffset);
      if (reset) {
        setTracks(result);
        setOffset(PAGE_SIZE);
      } else {
        setTracks((prev) => [...prev, ...result]);
        setOffset((prev) => prev + PAGE_SIZE);
      }
      setHasMore(result.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load tracks:", err);
    } finally {
      setLoading(false);
    }
  }

  async function searchTracks() {
    setLoading(true);
    try {
      const result = await httpApi.searchTracks(searchQuery);
      setTracks(result);
      setHasMore(false);
    } catch (err) {
      console.error("Failed to search:", err);
    } finally {
      setLoading(false);
    }
  }

  // Infinite scroll (only when not in playlist mode)
  const handleScroll = useCallback(() => {
    if (isPlaylistMode || !listRef.current || loading || !hasMore || searchQuery.trim())
      return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadTracks(false);
    }
  }, [isPlaylistMode, loading, hasMore, searchQuery, offset]);

  const displayedTracks = isPlaylistMode && searchQuery.trim()
    ? tracks.filter(
        (t) =>
          (t.title ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.artist ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.album ?? "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tracks;

  // Pull to refresh
  function handleRefresh() {
    if (searchQuery.trim()) {
      searchTracks();
    } else {
      loadTracks(true);
    }
  }

  return (
    <div className="mobile-track-list">
      {isPlaylistMode && (
        <div className="mobile-playlist-title">
          Playlist: {playlistName || "Shared playlist"}
        </div>
      )}
      <div className="mobile-search">
        <input
          type="search"
          placeholder="Search tracks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mobile-search-input"
        />
        {searchQuery && (
          <button
            className="mobile-search-clear"
            onClick={() => setSearchQuery("")}
          >
            &times;
          </button>
        )}
      </div>

      <div
        className="mobile-track-scroll"
        ref={listRef}
        onScroll={handleScroll}
      >
        {displayedTracks.map((track, index) => (
          <button
            key={track.id}
            className="mobile-track-item"
            onClick={() => onPlayTrack(track, tracks, index)}
          >
            <div className="mobile-track-info">
              <span className="mobile-track-title">
                {track.title || "Unknown"}
              </span>
              <span className="mobile-track-artist">
                {track.artist || "Unknown Artist"}
                {track.album ? ` — ${track.album}` : ""}
              </span>
            </div>
            <div className="mobile-track-meta">
              {track.bpm ? (
                <span className="mobile-track-bpm">
                  {Math.round(track.bpm)}
                </span>
              ) : null}
              <span className="mobile-track-duration">
                {formatDuration(track.duration_ms)}
              </span>
            </div>
          </button>
        ))}

        {loading && (
          <div className="mobile-loading">Loading...</div>
        )}

        {!loading && displayedTracks.length === 0 && (
          <div className="mobile-empty">
            {isPlaylistMode
              ? searchQuery
                ? "No tracks found"
                : "No tracks in this playlist"
              : searchQuery
                ? "No tracks found"
                : "No tracks in library"}
          </div>
        )}
      </div>
    </div>
  );
}
