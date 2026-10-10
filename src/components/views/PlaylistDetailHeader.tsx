import { useEffect, useRef, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import { usePlaylistCover } from '../../lib/playlistCovers'
import { tauriApi } from '../../lib/tauri-api'
import { toast } from '../../lib/toast'
import { getErrorMessage } from '../../types/ai'
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import { Menu } from '../menu/Menu'
import './PlaylistDetailHeader.css'

interface PlaylistDetailHeaderProps {
  playlist: Playlist
  tracks: Track[]
  /** A cover was chosen or removed: the playlists are read again. */
  onCoverChanged?: () => void
}

/** The images a cover can be (set_playlist_cover checks them too). */
const COVER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']

// --- Metadata computation helpers ---

function computeBpmRange(tracks: Track[]): string {
  const bpms = tracks.map((t) => t.bpm).filter((b): b is number => b != null && b > 0)
  if (bpms.length === 0) return ''
  return `${Math.round(Math.min(...bpms))} - ${Math.round(Math.max(...bpms))} BPM`
}

function computeKeyDistribution(tracks: Track[]): string {
  const keyCounts: Record<string, number> = {}
  tracks.forEach((t) => {
    if (t.musical_key) {
      keyCounts[t.musical_key] = (keyCounts[t.musical_key] || 0) + 1
    }
  })
  return Object.entries(keyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key)
    .join(', ')
}

function formatTotalDuration(tracks: Track[]): string {
  const totalMs = tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0)
  if (totalMs === 0) return ''
  const hours = Math.floor(totalMs / 3600000)
  const minutes = Math.floor((totalMs % 3600000) / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function PlaylistDetailHeader({ playlist, tracks, onCoverChanged }: PlaylistDetailHeaderProps) {
  const [compressed, setCompressed] = useState(false)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)
  // Its own cover, chosen with Change cover, comes before the first track's art.
  const ownCover = usePlaylistCover(playlist)
  const shownArt = ownCover ?? artworkUrl
  const coverButton = useRef<HTMLButtonElement>(null)
  const [coverMenu, setCoverMenu] = useState<{ x: number; y: number } | null>(null)

  async function chooseCover() {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: COVER_EXTENSIONS }],
    }).catch(() => null)
    if (typeof picked !== 'string') return
    try {
      await tauriApi.setPlaylistCover(playlist.id, picked)
      onCoverChanged?.()
    } catch (err) {
      toast(`Couldn't change the cover: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  async function removeCover() {
    try {
      await tauriApi.clearPlaylistCover(playlist.id)
      onCoverChanged?.()
    } catch (err) {
      toast(`Couldn't remove the cover: ${getErrorMessage(err)}`, { kind: 'error' })
    }
  }

  // With a cover of its own: choose another or remove it; without, straight to choosing.
  function openCoverChoice() {
    if (!playlist.cover_path) {
      void chooseCover()
      return
    }
    const box = coverButton.current?.getBoundingClientRect()
    if (box) setCoverMenu({ x: box.left + 8, y: box.bottom - 8 })
  }

  // Load artwork from the first track that has it
  useEffect(() => {
    const firstTrackWithId = tracks.find((t) => t.id != null)
    if (!firstTrackWithId) {
      setArtworkUrl(null)
      return
    }
    let cancelled = false
    getTrackArtworkUrl(firstTrackWithId.id).then((url) => {
      if (!cancelled) setArtworkUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [playlist.id, tracks])

  // Compute DJ metadata from tracks
  const bpmRange = computeBpmRange(tracks)
  const keyDistribution = computeKeyDistribution(tracks)
  const totalDuration = formatTotalDuration(tracks)
  const trackCount = tracks.length

  // Generate a gradient placeholder for when no artwork is available
  const initial = playlist.name.charAt(0).toUpperCase()

  return (
    <div
      className={`playlist-header ${compressed ? 'playlist-header--compressed' : ''}`}
    >
      {/* Album art */}
      <div className="playlist-header__art">
        {shownArt ? (
          <img
            src={shownArt}
            alt={`${playlist.name} artwork`}
            className="playlist-header__art-img"
          />
        ) : (
          <div className="playlist-header__art-placeholder">
            <span className="playlist-header__art-initial">{initial}</span>
          </div>
        )}
        <button
          ref={coverButton}
          type="button"
          className="playlist-header__cover-btn"
          aria-label="Change cover"
          data-tip="Change cover" data-tip-overflow
          aria-haspopup={playlist.cover_path ? 'menu' : undefined}
          aria-expanded={playlist.cover_path ? coverMenu !== null : undefined}
          onClick={openCoverChoice}
        >
          <Icon name="ImagePlus" size={compressed ? 16 : 26} />
          <span className="playlist-header__cover-label">Change cover</span>
        </button>
        {coverMenu && (
          <Menu
            at={coverMenu}
            label="Cover"
            entries={[
              { kind: 'action', label: 'Choose an image…', icon: 'ImagePlus', onSelect: () => void chooseCover() },
              { kind: 'action', label: 'Remove cover', icon: 'Trash2', onSelect: () => void removeCover() },
            ]}
            onClose={() => setCoverMenu(null)}
          />
        )}
      </div>

      {/* Playlist info */}
      <div className="playlist-header__info">
        <span className="playlist-header__type">Playlist</span>
        <h1 className="playlist-header__name">{playlist.name}</h1>

        {/* DJ metadata row */}
        <div className="playlist-header__meta">
          {trackCount > 0 && (
            <span className="playlist-header__meta-item">
              <Icon name="Music" size={13} />
              {trackCount} track{trackCount !== 1 ? 's' : ''}
            </span>
          )}
          {totalDuration && (
            <span className="playlist-header__meta-item">
              <Icon name="Clock" size={13} />
              {totalDuration}
            </span>
          )}
          {bpmRange && (
            <span className="playlist-header__meta-item">
              <Icon name="Activity" size={13} />
              {bpmRange}
            </span>
          )}
          {keyDistribution && (
            <span className="playlist-header__meta-item">
              <Icon name="Music2" size={13} />
              {keyDistribution}
            </span>
          )}
        </div>
      </div>

      {/* Collapse/expand toggle */}
      <button
        className="playlist-header__toggle"
        onClick={() => setCompressed((v) => !v)}
        data-tip={compressed ? 'Expand header' : 'Collapse header'} aria-label={compressed ? 'Expand header' : 'Collapse header'}
        type="button"
      >
        <Icon name={compressed ? 'ChevronDown' : 'ChevronUp'} size={16} />
      </button>
    </div>
  )
}
