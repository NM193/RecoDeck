import { useCallback } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { QRCodeSVG } from 'qrcode.react'
import { Icon } from './Icon'
import './SharePlaylistModal.css'

interface SharePlaylistModalProps {
  open: boolean
  playlistId: number
  playlistName: string
  companionUrl: string
  companionToken: string
  onClose: () => void
}

export function SharePlaylistModal({
  open,
  playlistId,
  playlistName,
  companionUrl,
  companionToken,
  onClose,
}: SharePlaylistModalProps) {
  const shareUrl = `${companionUrl}/?token=${companionToken}&playlist=${playlistId}&name=${encodeURIComponent(playlistName)}`

  const handleOpenLink = useCallback(() => {
    openUrl(shareUrl)
  }, [shareUrl])

  if (!open) return null

  return (
    <div className="share-playlist-backdrop" onClick={onClose}>
      <div
        className="share-playlist-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-playlist-title"
      >
        <div className="share-playlist-header">
          <h2 id="share-playlist-title" className="share-playlist-title">
            Share: {playlistName}
          </h2>
          <button
            type="button"
            className="share-playlist-close"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="share-playlist-qr">
          <QRCodeSVG value={shareUrl} size={180} level="M" />
          <span className="share-playlist-qr-hint">
            Pošalji link ili skeniraj QR — pri otvaranju linka automatski se
            povezuje i otvara playlista
          </span>
        </div>

        <button
          type="button"
          className="btn-primary share-playlist-open-btn"
          onClick={handleOpenLink}
        >
          Otvori link u browseru
        </button>
      </div>
    </div>
  )
}
