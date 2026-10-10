// src/components/dj/DjPlaysTab.tsx
// The Plays tab: the named tracks of the DJ's saved sets, most-played first —
// `Track · in N of M sets · Status`, with a bar for the share of their sets.
// Its own status cell: no Yes / No, since verdicts are keyed by Spotify id.
import { useRef } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { CopyButton, YouTubeButton } from '../spotify/SpotifyRowActions'
import { fileName } from '../../lib/spotify/rows'
import { playSearchUrl, playText, type Play } from '../../lib/dj/plays'
import { inSets, ownedQueue, playShare } from '../../lib/dj/tabs'
import type { Ownership } from '../../lib/spotify/ownership'
import type { LibraryTrack } from '../../lib/tracklist/match'
import { GLIDE } from '../../lib/glide/glide'
import { useHoverGlide } from '../../lib/glide/useGlide'
import '../views/SpotifyView.css'

/** Owned ✓, or Maybe / Missing with YouTube, SelectedRecs ↗ and Copy. */
export function PlayStatus({
  play,
  ownership,
  checking = false,
}: {
  play: Play
  ownership: Ownership
  /** The library has not arrived yet: the status is not known. */
  checking?: boolean
}) {
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
  if (ownership.kind === 'owned') {
    return (
      <span className="spotify-status">
        <span className="spotify-status__owned">
          <Icon name="Check" size={14} strokeWidth={2.2} />
          Owned
        </span>
      </span>
    )
  }
  return (
    <span className="spotify-status">
      {ownership.kind === 'maybe' ? (
        <span className="spotify-status__maybe">Maybe</span>
      ) : (
        <span className="spotify-status__missing">Missing</span>
      )}
      <YouTubeButton text={playText(play)} />
      <button
        type="button"
        className="spotify-mini spotify-mini--icon"
        data-tip="Search on SelectedRecs"
        aria-label="Search on SelectedRecs"
        onClick={() => {
          openUrl(playSearchUrl(play)).catch(() => {})
        }}
      >
        <Icon name="ExternalLink" size={12} />
      </button>
      <CopyButton text={playText(play)} />
    </span>
  )
}

/** "4 of 6" and the bar: the share of the DJ's saved sets that name the track. */
export function PlayBar({
  count,
  sets,
  label,
}: {
  count: number
  sets: number
  label: string
}) {
  return (
    <span className="dj-play__sets" role="cell" data-tip={inSets(count, sets)} aria-description={inSets(count, sets)}>
      <span className="dj-play__bar">
        <i style={{ width: `${playShare(count, sets)}%` }} />
      </span>
      {label}
    </span>
  )
}

interface DjPlayRowProps {
  play: Play
  ownership: Ownership
  /** How many saved sets the DJ has: the M of "in N of M sets". */
  sets: number
  /** 1-based, as shown in the # column. */
  number: number
  /** Double-click: plays an Owned row's file. */
  onPlay: (ownership: Ownership) => void
  /** The library has not arrived yet: the status is not known. */
  checking?: boolean
}

export function DjPlayRow({
  play,
  ownership,
  sets,
  number,
  onPlay,
  checking = false,
}: DjPlayRowProps) {
  const text = playText(play)
  return (
    <>
      <div
        className={`spotify-row spotify-row--data dj-play ${ownership.kind === 'owned' ? 'spotify-row--owned' : ''}`}
        role="row"
        onDoubleClick={() => onPlay(ownership)}
      >
        <span className="spotify-cell--num" role="cell">
          {number}
        </span>
        <span className="spotify-cell--title" role="cell" data-tip={text} data-tip-overflow>
          {text}
        </span>
        <PlayBar
          count={play.count}
          sets={sets}
          label={inSets(play.count, sets)}
        />
        <span
          className="spotify-cell--status"
          role="cell"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <PlayStatus play={play} ownership={ownership} checking={checking} />
        </span>
      </div>
      {ownership.kind === 'maybe' && ownership.file && (
        <div className="spotify-row spotify-row--sub dj-play" role="row">
          <span role="cell" />
          <span className="spotify-hint" role="cell" aria-colspan={3}>
            In library:{' '}
            <code data-tip={ownership.file.file_path} aria-description={ownership.file.file_path}>
              {fileName(ownership.file.file_path)}
            </code>
            <span className="spotify-hint__why">· {ownership.reason}</span>
          </span>
        </div>
      )}
    </>
  )
}

interface DjPlaysTabProps {
  name: string
  /** Their saved sets; null while read. */
  sets: number | null
  /** Most-played first; null while read. */
  plays: Play[] | null
  /** playOwnership per play key, against the shared library index. */
  ownership: Map<string, Ownership>
  /** The library has not arrived yet: statuses are not known. */
  checking: boolean
  /** Plays library files, queued: the file at `index` first (DjView finds the Tracks). */
  onPlayFiles: (queue: LibraryTrack[], index: number) => void
}

const MISSING: Ownership = { kind: 'missing' }

export function DjPlaysTab({
  name,
  sets,
  plays,
  ownership,
  checking,
  onPlayFiles,
}: DjPlaysTabProps) {
  // The hover slides from row to row (Micro-interactions spec, Rows).
  const tableRef = useRef<HTMLDivElement>(null)
  const glideRef = useRef<HTMLSpanElement>(null)
  useHoverGlide(tableRef, glideRef, '.spotify-row--data', GLIDE.row)

  if (sets === null || plays === null)
    return <p className="dj-note">Reading your saved sets…</p>
  if (sets === 0) {
    return (
      <p className="dj-note">
        No saved sets of {name} yet. What they play shows here once you save
        one.
      </p>
    )
  }
  if (plays.length === 0) {
    return (
      <p className="dj-note">
        Their saved sets name no tracks yet — only IDs, or no tracklist.
      </p>
    )
  }

  const ownershipOf = (play: Play) => ownership.get(play.key) ?? MISSING
  const playOwned = (target: Ownership) => {
    const start = ownedQueue(plays.map(ownershipOf), target)
    if (start) onPlayFiles(start.queue, start.index)
  }

  return (
    <div className="dj-plays">
      <div className="dj-tabhead">
        <span>
          What they play · from your {sets} {sets === 1 ? 'set' : 'sets'}, most
          played first
        </span>
      </div>
      <div
        ref={tableRef}
        className="glide-track spotify-table dj-table"
        role="table"
        aria-label="What they play"
      >
        <span ref={glideRef} className="glide" aria-hidden="true" />
        <div className="spotify-row spotify-row--head dj-play" role="row">
          <span className="spotify-cell--num" role="columnheader">
            #
          </span>
          <span role="columnheader">Track</span>
          <span role="columnheader">Played</span>
          <span className="spotify-cell--status" role="columnheader">
            Status
          </span>
        </div>
        {plays.map((play, index) => (
          <DjPlayRow
            key={play.key}
            play={play}
            ownership={ownershipOf(play)}
            sets={sets}
            number={index + 1}
            checking={checking}
            onPlay={playOwned}
          />
        ))}
      </div>
    </div>
  )
}
