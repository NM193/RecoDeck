// src/components/spotify/SpotifyRowActions.tsx
// The Status cell of a Spotify row: what it is, and what can be done about it.
import { useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SpotifyGlyph } from './SpotifyGlyph'
import { YouTubeGlyph } from './YouTubeGlyph'
import { tauriApi } from '../../lib/tauri-api'
import {
  copyText,
  selectedRecsUrl,
  youtubeSearchUrl,
} from '../../lib/spotify/title'
import type { SpotifyRow } from '../../lib/spotify/rows'
import type { Verdict } from '../../types/spotify'

interface SpotifyRowActionsProps {
  row: SpotifyRow
  /** Rejects when the answer could not be saved. */
  onVerdict: (verdict: Verdict) => Promise<void>
  /** The library has not arrived yet: the status is not known. */
  checking?: boolean
}

const COPIED_MS = 1500

/**
 * An icon like SelectedRecs' ↗, then a green ✓ for 1.5 s; every click
 * restarts that time. Also the DJ page's Plays rows' Copy (DjPlaysTab's
 * PlayStatus).
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        clearTimeout(copiedTimer.current)
        setCopied(true)
        copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
      })
      .catch(() => {})
  }

  return (
    <button
      type="button"
      className={`spotify-mini spotify-mini--icon${copied ? ' spotify-mini--copied' : ''}`}
      title={copied ? 'Copied' : `Copy “${text}”`}
      aria-label={copied ? 'Copied' : 'Copy artist and title'}
      onClick={copy}
    >
      <Icon name={copied ? 'Check' : 'Copy'} size={12} />
    </button>
  )
}

/**
 * Opens YouTube's search for the track — a listen for what Spotify cannot
 * play or the library does not have. Also the DJ page's Plays rows.
 */
export function YouTubeButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="spotify-mini spotify-mini--icon spotify-mini--youtube"
      title={`Search YouTube for “${text}”`}
      aria-label="Search on YouTube"
      onClick={() => {
        openUrl(youtubeSearchUrl(text)).catch(() => {})
      }}
    >
      <YouTubeGlyph size={12} />
    </button>
  )
}

/**
 * Yes / No on a Maybe row, and "Not saved" when the answer did not stick.
 * Also YouTube Music's Maybe rows.
 */
export function VerdictButtons({
  onVerdict,
}: {
  /** Rejects when the answer could not be saved. */
  onVerdict: (verdict: Verdict) => Promise<void>
}) {
  /** The answer being saved; the buttons wait for it. */
  const [pending, setPending] = useState<Verdict | null>(null)
  const [answerFailed, setAnswerFailed] = useState(false)

  const answer = (verdict: Verdict) => {
    setPending(verdict)
    setAnswerFailed(false)
    onVerdict(verdict)
      .catch(() => setAnswerFailed(true))
      .finally(() => setPending(null))
  }

  return (
    <>
      {answerFailed && (
        <span className="spotify-status__error" role="status">
          Not saved
        </span>
      )}
      <button
        type="button"
        className="spotify-mini"
        disabled={pending !== null}
        aria-busy={pending === 'yes'}
        onClick={() => answer('yes')}
        title="This is the file"
      >
        {pending === 'yes' ? '…' : 'Yes'}
      </button>
      <button
        type="button"
        className="spotify-mini"
        disabled={pending !== null}
        aria-busy={pending === 'no'}
        onClick={() => answer('no')}
        title="Not this file"
      >
        {pending === 'no' ? '…' : 'No'}
      </button>
    </>
  )
}

export function SpotifyRowActions({
  row,
  onVerdict,
  checking = false,
}: SpotifyRowActionsProps) {
  if (checking) {
    return (
      <span className="spotify-status">
        <span className="spotify-status__checking">
          <span aria-hidden="true">—</span>
          <span className="spotify-sr-only">Checking</span>
        </span>
      </span>
    )
  }

  const play = (
    <button
      type="button"
      className="spotify-mini spotify-mini--icon spotify-mini--play"
      title="Play on Spotify"
      aria-label="Play on Spotify"
      onClick={() => {
        // Rust opens the Spotify app itself when there is no active device or
        // no Premium, and the web player when there is no Spotify app.
        const id = row.track.spotifyId
        void tauriApi.playSpotifyTrack(id).catch(() =>
          // Anything else that failed: the web player still plays it.
          openUrl(
            `https://open.spotify.com/track/${encodeURIComponent(id)}`,
          ).catch(() => {}),
        )
      }}
    >
      <SpotifyGlyph size={12} />
    </button>
  )

  if (row.ownership.kind === 'owned') {
    return (
      <span className="spotify-status">
        <span className="spotify-status__owned">
          <Icon name="Check" size={14} strokeWidth={2.2} />
          Owned
        </span>
        {play}
      </span>
    )
  }

  if (row.ownership.kind === 'maybe') {
    return (
      <span className="spotify-status">
        <span className="spotify-status__maybe">Maybe</span>
        {play}
        <YouTubeButton text={copyText(row.track)} />
        <VerdictButtons onVerdict={onVerdict} />
      </span>
    )
  }

  return (
    <span className="spotify-status">
      <span className="spotify-status__missing">Missing</span>
      {play}
      <YouTubeButton text={copyText(row.track)} />
      <button
        type="button"
        className="spotify-mini spotify-mini--icon"
        title="Search on SelectedRecs"
        aria-label="Search on SelectedRecs"
        onClick={() => {
          openUrl(selectedRecsUrl(row.track)).catch(() => {})
        }}
      >
        <Icon name="ExternalLink" size={12} />
      </button>
      <CopyButton text={copyText(row.track)} />
    </span>
  )
}
