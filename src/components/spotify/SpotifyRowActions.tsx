// src/components/spotify/SpotifyRowActions.tsx
// The Status cell of a Spotify row: what it is, and what can be done about it.
import { useEffect, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { SpotifyGlyph } from './SpotifyGlyph'
import { tauriApi } from '../../lib/tauri-api'
import { copyText, selectedRecsUrl } from '../../lib/spotify/title'
import type { SpotifyRow } from '../../lib/spotify/rows'
import type { Verdict } from '../../types/spotify'

interface SpotifyRowActionsProps {
  row: SpotifyRow
  onVerdict: (verdict: Verdict) => void
}

const COPIED_MS = 1500

export function SpotifyRowActions({ row, onVerdict }: SpotifyRowActionsProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

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
        <button
          type="button"
          className="spotify-mini"
          onClick={() => onVerdict('yes')}
          title="This is the file"
        >
          Yes
        </button>
        <button
          type="button"
          className="spotify-mini"
          onClick={() => onVerdict('no')}
          title="Not this file"
        >
          No
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
          void openUrl(selectedRecsUrl(row.track))
        }}
      >
        <Icon name="ExternalLink" size={12} />
      </button>
      <button
        type="button"
        className={`spotify-mini ${copied ? 'spotify-mini--copied' : 'spotify-mini--primary'}`}
        title={copyText(row.track)}
        onClick={() => {
          void navigator.clipboard
            .writeText(copyText(row.track))
            .then(() => setCopied(true))
            .catch(() => {})
        }}
      >
        <Icon name={copied ? 'Check' : 'Copy'} size={12} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}
