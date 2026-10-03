// src/components/spotify/SpotifyRowActions.tsx
// The Status cell of a Spotify row: what it is, and what can be done about it.
import { useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SpotifyGlyph } from './SpotifyGlyph'
import { tauriApi } from '../../lib/tauri-api'
import { copyText, selectedRecsUrl } from '../../lib/spotify/title'
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

export function SpotifyRowActions({
  row,
  onVerdict,
  checking = false,
}: SpotifyRowActionsProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  /** The answer being saved; the buttons wait for it. */
  const [pending, setPending] = useState<Verdict | null>(null)
  const [answerFailed, setAnswerFailed] = useState(false)

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  // Every click restarts the "Copied" time.
  const copy = () => {
    navigator.clipboard
      .writeText(copyText(row.track))
      .then(() => {
        clearTimeout(copiedTimer.current)
        setCopied(true)
        copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
      })
      .catch(() => {})
  }

  const answer = (verdict: Verdict) => {
    setPending(verdict)
    setAnswerFailed(false)
    onVerdict(verdict)
      .catch(() => setAnswerFailed(true))
      .finally(() => setPending(null))
  }

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
        // Rust opens the Spotify app itself when there is no active device or no Premium.
        void tauriApi.playSpotifyTrack(row.track.spotifyId).catch(() => {})
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
      </span>
    )
  }

  return (
    <span className="spotify-status">
      <span className="spotify-status__missing">Missing</span>
      {play}
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
      <button
        type="button"
        className={`spotify-mini ${copied ? 'spotify-mini--copied' : 'spotify-mini--primary'}`}
        title={copyText(row.track)}
        onClick={copy}
      >
        <Icon name={copied ? 'Check' : 'Copy'} size={12} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}
