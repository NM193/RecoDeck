// src/components/youtube-music/YouTubeMusicRowActions.tsx
// The Status cell of a YouTube Music row. Play opens the exact video on
// YouTube Music in the browser: YouTube has no API to play it anywhere else.
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { CopyButton, VerdictButtons } from '../spotify/SpotifyRowActions'
import { YouTubeGlyph } from '../spotify/YouTubeGlyph'
import {
  copyText,
  musicUrl,
  selectedRecsUrl,
} from '../../lib/youtube-music/title'
import type { YtmRow } from '../../lib/youtube-music/rows'
import type { Verdict } from '../../types/spotify'

interface YouTubeMusicRowActionsProps {
  row: YtmRow
  /** Rejects when the answer could not be saved. */
  onVerdict: (verdict: Verdict) => Promise<void>
  /** The library has not arrived yet: the status is not known. */
  checking: boolean
}

export function YouTubeMusicRowActions({
  row,
  onVerdict,
  checking,
}: YouTubeMusicRowActionsProps) {
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
      className="spotify-mini spotify-mini--icon spotify-mini--youtube"
      title="Play on YouTube Music"
      aria-label="Play on YouTube Music"
      onClick={() => {
        openUrl(musicUrl(row.track.videoId)).catch(() => {})
      }}
    >
      <YouTubeGlyph size={12} />
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
        <VerdictButtons onVerdict={onVerdict} />
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
      <CopyButton text={copyText(row.track)} />
    </span>
  )
}
