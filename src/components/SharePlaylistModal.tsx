import { useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { QRCodeSVG } from 'qrcode.react'
import { Icon } from './Icon'
import { Skeleton } from './Skeleton'
import { useOverlay } from '../lib/overlays'
import { toast } from '../lib/toast'
import { tauriApi } from '../lib/tauri-api'
import {
  SHARE_DURATIONS,
  expiresLine,
  shareLinkUrl,
} from '../lib/share/shareText'
import { getErrorMessage } from '../types/ai'
import type { ShareLink } from '../types/track'
import './SharePlaylistModal.css'

interface SharePlaylistModalProps {
  open: boolean
  playlistId: number
  playlistName: string
  /** The companion server's URL; the link carries the playlist's own share token. */
  companionUrl: string
  onClose: () => void
}

/** How long "Copied" stays on the button, in ms. */
const COPIED_MS = 2000

// Share a playlist (spec 2026-10-16): a link that opens this playlist only,
// for 24 hours, 7 days or 30 days. Opening it finds the playlist's live link
// or makes one for 7 days.
export function SharePlaylistModal({
  open,
  playlistId,
  playlistName,
  companionUrl,
  onClose,
}: SharePlaylistModalProps) {
  // The link answered for this playlist; another playlist's shows as loading.
  const [found, setFound] = useState<ShareLink | null>(null)
  const link = found?.playlist_id === playlistId ? found : null
  const [savingDays, setSavingDays] = useState(false)
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Open, it tells the app (useOverlay): Esc closes it, and the set video steps aside.
  useOverlay(open, onClose)

  // The link: the playlist's live one, or a new one.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    let cancelled = false
    tauriApi
      .getOrCreateShareLink(playlistId)
      .then((answer) => {
        if (!cancelled) setFound(answer)
      })
      .catch((err) => {
        if (cancelled) return
        toast(`Couldn't make a share link: ${getErrorMessage(err)}`, {
          kind: 'error',
        })
        onCloseRef.current()
      })
    return () => {
      cancelled = true
    }
  }, [open, playlistId])

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )

  if (!open) return null

  const url = link ? shareLinkUrl(companionUrl, link.token) : ''

  function copyLink() {
    if (!url) return
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        if (copiedTimer.current) clearTimeout(copiedTimer.current)
        copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
      })
      .catch(() => toast("Couldn't copy the link", { kind: 'error' }))
  }

  // A click restarts the link's time from now.
  function pickDays(days: ShareLink['days']) {
    if (!link || savingDays) return
    setSavingDays(true)
    tauriApi
      .setShareLinkDays(link.token, days)
      .then(setFound)
      .catch((err) =>
        toast(
          `Couldn't change how long the link works: ${getErrorMessage(err)}`,
          {
            kind: 'error',
          },
        ),
      )
      .finally(() => setSavingDays(false))
  }

  function openInBrowser() {
    if (!url) return
    openUrl(url).catch((err) =>
      toast(`Couldn't open the link: ${getErrorMessage(err)}`, {
        kind: 'error',
      }),
    )
  }

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
          <div className="share-playlist-heading">
            <h2 id="share-playlist-title" className="share-playlist-title">
              Share playlist
            </h2>
            <p className="share-playlist-name">{playlistName}</p>
          </div>
          <button
            type="button"
            className="share-playlist-close"
            onClick={onClose}
            aria-label="Close"
            data-tip="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="share-playlist-qr-row">
          <div className="share-playlist-qr">
            {link ? (
              <QRCodeSVG value={url} size={128} level="M" />
            ) : (
              <Skeleton width={128} height={128} />
            )}
          </div>
          <p className="share-playlist-hint">
            Scan with a phone camera, or send the link. It opens this playlist
            only, not the rest of your library.
          </p>
        </div>

        <label className="share-playlist-label" htmlFor="share-playlist-url">
          Link
        </label>
        <div className="share-playlist-link">
          <input
            id="share-playlist-url"
            className="share-playlist-input"
            type="text"
            readOnly
            value={url}
            placeholder="Making the link…"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="btn share-playlist-copy"
            onClick={copyLink}
            disabled={!link}
            aria-live="polite"
          >
            <Icon name={copied ? 'Check' : 'Copy'} size={14} />
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        <div className="share-playlist-label" id="share-playlist-days-label">
          Link works for
        </div>
        <div
          className="segmented share-playlist-days"
          role="group"
          aria-labelledby="share-playlist-days-label"
        >
          {SHARE_DURATIONS.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              className="segmented__item"
              aria-pressed={link?.days === days}
              disabled={!link || savingDays}
              onClick={() => pickDays(days)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="share-playlist-expiry">
          {link && (
            <>
              <span className="share-playlist-expiry-date">
                {expiresLine(link.expires_at)}
              </span>
              . Stop it any time in Settings → Mobile Companion.
            </>
          )}
        </p>

        <div className="share-playlist-note">
          <Icon name="Wifi" size={15} />
          <span>
            Works on the same Wi-Fi while RecoDeck is open on this Mac.
          </span>
        </div>

        <div className="share-playlist-footer">
          <button
            type="button"
            className="btn"
            onClick={openInBrowser}
            disabled={!link}
          >
            <Icon name="ExternalLink" size={14} />
            Open in browser
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
