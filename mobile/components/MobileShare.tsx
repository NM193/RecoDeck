// Share link pages: one shared playlist (no library, search or settings), and the
// notices around it (loading, link expired, can't reach the computer).

import { useEffect, useState, type ReactNode } from 'react'
import { httpApi } from '../../src/lib/http-api'
import type { Track } from '../../src/types/track'
import {
  formatShareUntil,
  formatTotalLength,
  formatTrackCount,
  formatTrackLength,
  isUnauthorized,
} from '../share'

interface MobileSharedPlaylistProps {
  /** From the server's status, never from the URL */
  playlistId: number
  playlistName: string
  /** The playlist's count from the status, shown until the tracks load */
  trackCount: number
  /** Unix seconds */
  expiresAt: number
  currentTrackId?: number
  onPlayTrack: (track: Track, tracks: Track[], index: number) => void
  /** A 401: the link expired or was stopped */
  onExpired: () => void
  /** The player bar, between the list and the footer */
  player?: ReactNode
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path d="M7 4v16l13-8z" />
    </svg>
  )
}

export function MobileSharedPlaylist({
  playlistId,
  playlistName,
  trackCount,
  expiresAt,
  currentTrackId,
  onPlayTrack,
  onExpired,
  player,
}: MobileSharedPlaylistProps) {
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    httpApi
      .getPlaylistTracks(playlistId)
      .then((result) => {
        if (!cancelled) setTracks(result)
      })
      .catch((err) => {
        if (cancelled) return
        if (isUnauthorized(err)) {
          onExpired()
        } else {
          console.error('Failed to load the shared playlist:', err)
          setLoadFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [playlistId, attempt, onExpired])

  const count = tracks ? tracks.length : trackCount
  const length = tracks ? formatTotalLength(tracks) : undefined
  const meta = length
    ? `${formatTrackCount(count)} · ${length}`
    : formatTrackCount(count)

  return (
    <div className="mobile-app mobile-share">
      <header className="mobile-share-header">
        <div className="mobile-share-brand">
          <span className="mobile-share-label">RECODECK</span>
          <span className="mobile-share-chip">Shared playlist</span>
        </div>
        <div className="mobile-share-heading">
          <h1 className="mobile-share-name">{playlistName}</h1>
          <span className="mobile-share-meta">{meta}</span>
        </div>
        <button
          type="button"
          className="mobile-share-play"
          disabled={!tracks || tracks.length === 0}
          onClick={() => {
            if (tracks && tracks.length > 0) onPlayTrack(tracks[0], tracks, 0)
          }}
        >
          <PlayIcon />
          Play
        </button>
      </header>

      <main className="mobile-main">
        <ol className="mobile-track-scroll mobile-share-list">
          {tracks?.map((track, index) => (
            <li key={track.id}>
              <button
                type="button"
                className={
                  track.id === currentTrackId
                    ? 'mobile-track-item is-current'
                    : 'mobile-track-item'
                }
                aria-current={track.id === currentTrackId ? 'true' : undefined}
                onClick={() => onPlayTrack(track, tracks, index)}
              >
                <span className="mobile-share-track-n">{index + 1}</span>
                <span className="mobile-track-info">
                  <span className="mobile-track-title">
                    {track.title || 'Unknown'}
                  </span>
                  <span className="mobile-track-artist">
                    {track.artist || 'Unknown Artist'}
                  </span>
                </span>
                <span className="mobile-track-duration">
                  {formatTrackLength(track.duration_ms)}
                </span>
              </button>
            </li>
          ))}

          {!tracks && !loadFailed && (
            <li className="mobile-loading">Loading...</li>
          )}

          {!tracks && loadFailed && (
            <li className="mobile-empty">
              <p>Could not load the tracks.</p>
              <button
                type="button"
                className="mobile-share-retry"
                onClick={() => {
                  setLoadFailed(false)
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </button>
            </li>
          )}

          {tracks && tracks.length === 0 && (
            <li className="mobile-empty">No tracks in this playlist</li>
          )}
        </ol>
      </main>

      {player}

      <footer className="mobile-share-footer">
        Shared from RecoDeck · this link works until{' '}
        {formatShareUntil(expiresAt)}
      </footer>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function WifiOffIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
      <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
      <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

interface MobileShareNoticeProps {
  kind: 'loading' | 'expired' | 'unreachable'
  /** For 'unreachable': connect again */
  onRetry?: () => void
}

/** A full-screen notice in share mode: opening the link, the link expired, or the computer can't be reached */
export function MobileShareNotice({ kind, onRetry }: MobileShareNoticeProps) {
  return (
    <div className="mobile-share-notice">
      <span className="mobile-share-label">RECODECK</span>
      <div className="mobile-share-notice-body">
        {kind === 'loading' && <p className="mobile-loading">Loading...</p>}

        {kind === 'expired' && (
          <>
            <div className="mobile-share-notice-icon" aria-hidden="true">
              <ClockIcon />
            </div>
            <h1 className="mobile-share-notice-title">This link has expired</h1>
            <p className="mobile-share-notice-text">
              Ask whoever shared the playlist for a new link.
            </p>
          </>
        )}

        {kind === 'unreachable' && (
          <>
            <div className="mobile-share-notice-icon" aria-hidden="true">
              <WifiOffIcon />
            </div>
            <h1 className="mobile-share-notice-title">Can't reach RecoDeck</h1>
            <p className="mobile-share-notice-text">
              This playlist plays from a computer on the same Wi-Fi while
              RecoDeck is open there. Check your connection and try again.
            </p>
            {onRetry && (
              <button
                type="button"
                className="mobile-share-play"
                onClick={onRetry}
              >
                Try again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
