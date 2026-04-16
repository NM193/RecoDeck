import type { Playlist } from '../../../types/track'
import { Icon } from '../../Icon'

interface PlaylistsWidgetProps {
  playlists: Playlist[]
  onPlaylistSelect: (id: number) => void
}

const GRADIENTS = [
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
  'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
  'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
  'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
]

function getGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

export function PlaylistsWidget({ playlists, onPlaylistSelect }: PlaylistsWidgetProps) {
  const userPlaylists = playlists.filter(
    (p) => p.playlist_type === 'manual' || p.playlist_type === 'ai',
  )

  if (userPlaylists.length === 0) {
    return (
      <div className="widget-empty">
        <Icon name="ListMusic" size={20} />
        <span>No playlists yet</span>
      </div>
    )
  }

  return (
    <div className="widget-playlists">
      {userPlaylists.map((playlist) => (
        <button
          key={playlist.id}
          className="widget-playlists__card"
          onClick={() => onPlaylistSelect(playlist.id)}
        >
          <div
            className="widget-playlists__art"
            style={{ background: getGradient(playlist.name) }}
          >
            <span className="widget-playlists__initial">
              {playlist.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="widget-playlists__info">
            <span className="widget-playlists__name">{playlist.name}</span>
            <span className="widget-playlists__count">
              {playlist.track_count} track{playlist.track_count !== 1 ? 's' : ''}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
