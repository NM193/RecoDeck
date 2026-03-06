import { useState, useMemo } from 'react'
import { Icon } from '../Icon'
import type { Track, Playlist } from '../../types/track'
import './SearchView.css'

// Reuse the same gradient helper as HomeView (copied — do not import from HomeView)
function getPlaylistGradient(name: string): string {
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
    'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
    'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return gradients[Math.abs(hash) % gradients.length]
}

interface SearchViewProps {
  tracks: Track[]
  playlists: Playlist[]
  keyNotation?: 'camelot' | 'openkey'
  onTrackPlay: (track: Track, tracks: Track[], index: number) => void
  onPlaylistSelect: (id: number) => void
}

export function SearchView({ tracks, playlists, keyNotation = 'camelot', onTrackPlay, onPlaylistSelect }: SearchViewProps) {
  const [query, setQuery] = useState('')

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return tracks.filter(t =>
      [t.title, t.artist, t.album, t.genre].some(f => f?.toLowerCase().includes(q))
    )
  }, [tracks, query])

  const filteredPlaylists = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    // Only show manual and ai playlists (not folder-type)
    return playlists.filter(p =>
      (p.playlist_type === 'manual' || p.playlist_type === 'ai') &&
      p.name.toLowerCase().includes(q)
    )
  }, [playlists, query])

  const hasResults = filteredTracks.length > 0 || filteredPlaylists.length > 0
  const hasQuery = query.trim().length > 0

  // Format duration from ms to MM:SS
  function formatDuration(ms?: number) {
    if (!ms) return '--:--'
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Format key display (camelot vs openkey)
  function formatKey(key?: string) {
    if (!key) return '—'
    if (keyNotation === 'openkey') {
      if (key.endsWith('A')) return key.slice(0, -1) + 'm'
      if (key.endsWith('B')) return key.slice(0, -1) + 'd'
    }
    return key
  }

  return (
    <div className="search-view">
      {/* Prominent search input */}
      <div className="search-view__input-wrapper">
        <Icon name="Search" size={20} className="search-view__input-icon" />
        <input
          type="text"
          className="search-view__input"
          placeholder="Search tracks, playlists, artists..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button className="search-view__input-clear" onClick={() => setQuery('')} type="button">
            <Icon name="X" size={16} />
          </button>
        )}
      </div>

      {/* Empty state — no query */}
      {!hasQuery && (
        <div className="search-view__empty">
          <Icon name="Search" size={48} className="search-view__empty-icon" />
          <h2 className="search-view__empty-title">Search your library</h2>
          <p className="search-view__empty-subtitle">Find tracks, playlists, artists, and more</p>
        </div>
      )}

      {/* No results state */}
      {hasQuery && !hasResults && (
        <div className="search-view__empty">
          <Icon name="SearchX" size={48} className="search-view__empty-icon" />
          <h2 className="search-view__empty-title">No results for "{query}"</h2>
          <p className="search-view__empty-subtitle">Try a different search term</p>
        </div>
      )}

      {/* Results */}
      {hasQuery && hasResults && (
        <div className="search-view__results">

          {/* Tracks section */}
          {filteredTracks.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Tracks</h3>
                <span className="search-view__section-count">{filteredTracks.length}</span>
              </div>
              <div className="search-view__track-list">
                {filteredTracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="search-view__track-row"
                    onDoubleClick={() => onTrackPlay(track, filteredTracks, index)}
                  >
                    <div className="search-view__track-index">
                      <span className="search-view__track-number">{index + 1}</span>
                      <span className="search-view__track-play">
                        <Icon name="Play" size={13} />
                      </span>
                    </div>
                    <div className="search-view__track-title-cell">
                      <span className="search-view__track-title">{track.title || 'Untitled'}</span>
                      <span className="search-view__track-artist">{track.artist || 'Unknown Artist'}</span>
                    </div>
                    <span className="search-view__track-bpm">{track.bpm ? track.bpm.toFixed(1) : '—'}</span>
                    <span className="search-view__track-key">{formatKey(track.musical_key)}</span>
                    <span className="search-view__track-genre">{track.genre || '—'}</span>
                    <span className="search-view__track-duration">{formatDuration(track.duration_ms)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Playlists section */}
          {filteredPlaylists.length > 0 && (
            <div className="search-view__section">
              <div className="search-view__section-header">
                <h3 className="search-view__section-title">Playlists</h3>
                <span className="search-view__section-count">{filteredPlaylists.length}</span>
              </div>
              <div className="search-view__playlist-grid">
                {filteredPlaylists.map((playlist) => (
                  <button
                    key={playlist.id}
                    className="home-view__card search-view__playlist-card"
                    onClick={() => onPlaylistSelect(playlist.id)}
                    type="button"
                  >
                    <div
                      className="home-view__card-art"
                      style={{ background: getPlaylistGradient(playlist.name) }}
                    >
                      <Icon name="Music" size={24} style={{ color: 'rgba(255,255,255,0.7)' }} />
                    </div>
                    <div className="home-view__card-info">
                      <span className="home-view__card-name">{playlist.name}</span>
                      <span className="home-view__card-count">{playlist.track_count} tracks</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
