import type { Playlist } from '../../types/track'
import { Icon } from '../Icon'
import './HomeView.css'

interface HomeViewProps {
  playlists: Playlist[]
  totalTrackCount: number
  onPlaylistSelect: (id: number) => void
}

// Generate a deterministic gradient color based on playlist name
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

export function HomeView({ playlists, totalTrackCount, onPlaylistSelect }: HomeViewProps) {
  const userPlaylists = playlists.filter(
    (p) => p.playlist_type === 'manual' || p.playlist_type === 'ai',
  )
  const playlistCount = userPlaylists.length

  return (
    <div className="home-view">
      {/* Stats section */}
      <div className="home-view__stats">
        <div className="home-view__stat-card">
          <div className="home-view__stat-icon">
            <Icon name="Music" size={20} />
          </div>
          <div className="home-view__stat-content">
            <span className="home-view__stat-value">{totalTrackCount.toLocaleString()}</span>
            <span className="home-view__stat-label">Total Tracks</span>
          </div>
        </div>

        <div className="home-view__stat-card">
          <div className="home-view__stat-icon">
            <Icon name="ListMusic" size={20} />
          </div>
          <div className="home-view__stat-content">
            <span className="home-view__stat-value">{playlistCount}</span>
            <span className="home-view__stat-label">Playlists</span>
          </div>
        </div>
      </div>

      {/* Playlist grid */}
      {userPlaylists.length > 0 ? (
        <>
          <div className="home-view__section-header">
            <h2 className="home-view__section-title">Your Playlists</h2>
          </div>

          <div className="home-view__grid">
            {userPlaylists.map((playlist) => {
              const initial = playlist.name.charAt(0).toUpperCase()
              const gradient = getPlaylistGradient(playlist.name)

              return (
                <button
                  key={playlist.id}
                  className="home-view__card"
                  onClick={() => onPlaylistSelect(playlist.id)}
                >
                  <div
                    className="home-view__card-art"
                    style={{ background: gradient }}
                  >
                    <span className="home-view__card-initial">{initial}</span>
                  </div>
                  <div className="home-view__card-info">
                    <span className="home-view__card-name">{playlist.name}</span>
                    <span className="home-view__card-count">
                      {playlist.track_count} track{playlist.track_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="home-view__empty">
          <Icon name="ListMusic" size={48} />
          <h3 className="home-view__empty-title">No playlists yet</h3>
          <p className="home-view__empty-subtitle">
            Create a playlist in the sidebar to get started
          </p>
        </div>
      )}
    </div>
  )
}
