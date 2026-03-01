import { useEffect, useRef, useState } from 'react'
import { getTrackArtworkUrl } from '../../lib/artworkCache'
import type { Playlist, Track } from '../../types/track'
import { Icon } from '../Icon'
import './PlaylistDetailHeader.css'

interface PlaylistDetailHeaderProps {
  playlist: Playlist
  tracks: Track[]
}

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

export function PlaylistDetailHeader({ playlist, tracks }: PlaylistDetailHeaderProps) {
  const [compressed, setCompressed] = useState(false)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

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

  // Scroll compression via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setCompressed(!entry.isIntersecting),
      { threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // Compute DJ metadata from tracks
  const bpmRange = computeBpmRange(tracks)
  const keyDistribution = computeKeyDistribution(tracks)
  const totalDuration = formatTotalDuration(tracks)
  const trackCount = tracks.length

  // Generate a gradient placeholder for when no artwork is available
  const initial = playlist.name.charAt(0).toUpperCase()

  return (
    <>
      {/* Sentinel div — when this scrolls out of view, header compresses */}
      <div ref={sentinelRef} className="playlist-header__sentinel" />

      <div
        className={`playlist-header ${compressed ? 'playlist-header--compressed' : ''}`}
      >
        {/* Album art */}
        <div className="playlist-header__art">
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt={`${playlist.name} artwork`}
              className="playlist-header__art-img"
            />
          ) : (
            <div className="playlist-header__art-placeholder">
              <span className="playlist-header__art-initial">{initial}</span>
            </div>
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
      </div>
    </>
  )
}
