// src/components/sets/SetPage.tsx
// A set on a page of its own (Sets redesign spec, The set page), full width
// like a DJ page. The hero stays put — the thumbnail, or the video while
// this set plays here; the title, the DJs as links, the numbers, Play set or
// the player's buttons, and ⋯ — and only the strip, the filter and the rows
// under it scroll. It opens at once with what is known and skeleton rows
// while the set is read; a read that fails says so in place of the rows.
import { useLayoutEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Icon } from '../Icon'
import { Menu, type MenuEntry } from '../menu/Menu'
import { SetTimeline } from '../views/SetTimeline'
import { SetTrackRow } from './SetTrackRow'
import { TrackScrubber } from './TrackScrubber'
import { billingParts } from '../../lib/dj/names'
import { extractDjName } from '../../lib/tracklist/djName'
import { msToCue, type Track, type TracklistResult } from '../../lib/tracklist'
import type { MatchSummary } from '../../lib/tracklist/match'
import { playheadTrack, stepCue } from '../../lib/setPlayer/playhead'
import {
  filterCounts,
  filterRows,
  heroNumbers,
  missingTracks,
  savedLabel,
  sourceLine,
  thumbnailUrl,
  type SetFilter,
} from '../../lib/sets/setPage'
import { watchUrl } from '../../lib/youtubeWindow'
import { toast } from '../../lib/toast'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'
import type { Track as LibraryTrack } from '../../types/track'
import type { TrackEcho } from '../../types/youtube'
import './SetPage.css'

/** A set being read, or one that could not be: what is known of it so far. */
export interface SetOpening {
  videoId: string
  title: string | null
  /** Why it could not be read; null while it is still reading. */
  error: string | null
}

interface SetPageProps {
  /** The set, once read; null while `opening` says what is happening. */
  result: TracklistResult | null
  opening: SetOpening | null
  /** When it went into the library (`yt_sets.added_at`); null when it is not there. */
  savedAt: string | null
  matches: MatchSummary | null
  echoes: Map<number, TrackEcho>
  isSaved: (track: Track) => boolean
  bpmByIndex: Map<number, number>
  /** What the last Look again changed ("Found 4 more tracks"). */
  notice: string | null
  lookingAgain: boolean
  /** Opened at a track: that row is scrolled to. */
  focusCue: number | null
  onBack: () => void
  onRetry: () => void
  onOpenDj?: (name: string) => void
  onPlayFile: (track: LibraryTrack) => void
  onToggleSave: (track: Track) => void
  onFollowEcho: (echo: TrackEcho) => void
  onLookAgain: () => void
  /** Asks first; null when the set is not in the library. */
  onRemove: (() => void) | null
}

const FILTERS: Array<{ key: SetFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'have', label: 'You own' },
  { key: 'missing', label: 'Missing' },
  { key: 'ids', label: 'IDs' },
]

export function SetPage({
  result,
  opening,
  savedAt,
  matches,
  echoes,
  isSaved,
  bpmByIndex,
  notice,
  lookingAgain,
  focusCue,
  onBack,
  onRetry,
  onOpenDj,
  onPlayFile,
  onToggleSave,
  onFollowEcho,
  onLookAgain,
  onRemove,
}: SetPageProps) {
  const [filter, setFilter] = useState<SetFilter>('all')
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  const playing = useSetPlayer((s) => s.playing)
  const panel = useSetPlayer((s) => s.panel)
  const attachPageBox = useSetPlayer((s) => s.attachPageBox)

  const ready = result !== null && opening === null
  const video = ready ? result.video : null
  const videoId = video?.id ?? opening?.videoId ?? ''
  const title = video?.title ?? opening?.title ?? ''
  const playingHere = ready && playing?.result.video.id === result.video.id
  const untimed = Boolean(result?.untimed)
  const positionMs = panel?.position_ms ?? playing?.startMs ?? 0
  const durationMs = panel && panel.duration_ms > 0 ? panel.duration_ms : (video?.durationMs ?? 0)
  const current =
    playingHere && result ? playheadTrack(result.tracks, untimed, positionMs, durationMs) : null
  const videoPlaying = videoIsPlaying(panel)

  // Opened at a track: its row comes into view once the rows are there.
  useLayoutEffect(() => {
    if (!ready || focusCue === null) return
    const row = rowsRef.current?.querySelector<HTMLElement>(`[data-cue="${focusCue}"]`)
    row?.scrollIntoView({ block: 'center' })
  }, [ready, focusCue, videoId])

  const play = (cueMs: number) => {
    if (result) useSetPlayer.getState().play(result, cueMs)
  }

  const counts = result ? filterCounts(result.tracks, matches) : null
  const missing = result ? missingTracks(result.tracks, matches) : []

  const menu: MenuEntry[] = video
    ? [
        {
          kind: 'action',
          label: 'Open on YouTube',
          icon: 'ExternalLink',
          onSelect: () => void openUrl(watchUrl(video.url, playingHere ? positionMs : 0)),
        },
        {
          kind: 'action',
          label: 'Look again for a tracklist',
          icon: 'RefreshCw',
          hint: '5–7 units',
          disabled: lookingAgain,
          onSelect: onLookAgain,
        },
        {
          kind: 'action',
          label: 'Copy missing tracks',
          icon: 'Copy',
          hint: String(missing.length),
          disabled: missing.length === 0,
          onSelect: () => {
            void navigator.clipboard.writeText(missing.join('\n'))
            toast(`Copied ${missing.length} missing ${missing.length === 1 ? 'track' : 'tracks'}`)
          },
        },
        ...(onRemove
          ? ([
              { kind: 'separator' },
              { kind: 'action', label: 'Remove from library', icon: 'Trash2', danger: true, onSelect: onRemove },
            ] as MenuEntry[])
          : []),
      ]
    : []

  const djParts = video ? billingParts(extractDjName(video.title, video.channel)) : []
  const saved = savedLabel(savedAt)
  const source = result && ready ? sourceLine(result) : ''

  return (
    <div className="set-page">
      <div className={`set-hero${playingHere ? ' set-hero--playing' : ''}`}>
        <div className="set-hero__media">
          {playingHere ? (
            <>
              {/* Left empty: the YouTube panel is laid exactly over this box. */}
              <div className="set-hero__video" ref={attachPageBox} />
              {current && (
                <TrackScrubber
                  track={current.track}
                  startMs={current.startMs}
                  endMs={current.endMs}
                  positionMs={positionMs}
                  onSeek={(ms) => useSetPlayer.getState().seek(ms)}
                />
              )}
            </>
          ) : (
            <div
              className="set-hero__thumb"
              style={videoId ? { backgroundImage: `url(${thumbnailUrl(videoId)})` } : undefined}
            >
              {video && video.durationMs > 0 && (
                <span className="set-hero__length">{msToCue(video.durationMs)}</span>
              )}
            </div>
          )}
        </div>

        <div className="set-hero__text">
          <button type="button" className="set-hero__back" onClick={onBack}>
            <Icon name="ChevronLeft" size={14} /> Sets
          </button>
          <h1 className="set-hero__title" title={title}>
            {title || (opening?.error ? 'This set' : 'Reading the set…')}
          </h1>
          {video && (
            <div className="set-hero__who">
              {djParts.map((part, i) =>
                part.dj && onOpenDj ? (
                  <button
                    key={i}
                    type="button"
                    className="set-hero__dj"
                    onClick={() => onOpenDj(part.text)}
                    title={`Open ${part.text}'s page`}
                  >
                    {part.text}
                  </button>
                ) : (
                  <span key={i} className={part.dj ? 'set-hero__dj-name' : 'set-hero__sep'}>
                    {part.text}
                  </span>
                ),
              )}
              <span className="set-hero__sep">
                {[video.channel, saved].filter(Boolean).map((text) => ` · ${text}`).join('')}
              </span>
            </div>
          )}
          {result && ready && !playingHere && (
            <div className="set-hero__numbers">
              {heroNumbers(result, matches).map((n) => (
                <span key={n.key} className={n.owned ? 'set-hero__number set-hero__number--owned' : 'set-hero__number'}>
                  <b>{n.value.toLocaleString('en-US')}</b> {n.label}
                </span>
              ))}
            </div>
          )}
          {!playingHere && (source || notice) && (
            <p className="set-hero__source">{[source, notice].filter(Boolean).join(' · ')}</p>
          )}

          <div className="set-hero__actions">
            {playingHere && result ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary set-hero__primary"
                  onClick={() => useSetPlayer.getState().togglePause()}
                >
                  <Icon name={videoPlaying ? 'Pause' : 'Play'} size={14} /> {videoPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  className="btn set-hero__icon"
                  aria-label="Previous track"
                  disabled={stepCue(result.tracks, untimed, positionMs, -1) === null}
                  onClick={() => useSetPlayer.getState().step(-1)}
                >
                  <Icon name="SkipBack" size={14} />
                </button>
                <button
                  type="button"
                  className="btn set-hero__icon"
                  aria-label="Next track"
                  disabled={stepCue(result.tracks, untimed, positionMs, 1) === null}
                  onClick={() => useSetPlayer.getState().step(1)}
                >
                  <Icon name="SkipForward" size={14} />
                </button>
                <button type="button" className="btn" onClick={() => useSetPlayer.getState().stop()}>
                  <Icon name="X" size={14} /> Stop
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--primary set-hero__primary"
                disabled={!ready}
                onClick={() => play(0)}
              >
                <Icon name="Play" size={14} /> Play set
              </button>
            )}
            <button
              type="button"
              className="btn set-hero__icon"
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuAt !== null}
              disabled={!ready}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setMenuAt({ x: r.left, y: r.bottom + 4 })
              }}
            >
              <Icon name="Ellipsis" size={16} />
            </button>
          </div>
        </div>
      </div>
      {menuAt && <Menu at={menuAt} entries={menu} label="Set" onClose={() => setMenuAt(null)} />}

      <div className="set-page__scroll">
        {opening?.error ? (
          <div className="set-page__error">
            <p>Couldn&apos;t read this set: {opening.error}</p>
            <button type="button" className="btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : !ready || !result ? (
          <div className="set-page__rows" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="set-row set-row--skeleton">
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : result.tracks.length === 0 ? (
          <p className="set-page__empty">
            Nothing in the description and nothing usable in the comments. On a fresh set this is
            worth retrying in a few days — tracklists arrive slowly.
          </p>
        ) : (
          <>
            {untimed ? (
              <p className="set-page__note">
                This list came with no timestamps, so there is nothing to seek to — the order is the
                uploader&apos;s numbering. Everything else works: what you own is marked, and the
                tracks are searchable and can be saved.
              </p>
            ) : (
              <div className="set-page__strip">
                <SetTimeline
                  tracks={result.tracks}
                  durationMs={result.video.durationMs}
                  onSeek={play}
                  positionMs={playingHere ? positionMs : undefined}
                  playingIndex={current?.track.index ?? null}
                  bpmByIndex={bpmByIndex}
                />
              </div>
            )}

            <div className="set-page__filter" role="group" aria-label="Show">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="set-page__filter-btn"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label} {counts?.[key] ?? 0}
                </button>
              ))}
            </div>

            <div className="set-page__rows" ref={rowsRef}>
              <div className="set-row set-row--head" aria-hidden="true">
                <span>#</span>
                <span>{untimed ? '' : 'Time'}</span>
                <span>Track</span>
                <span>Lists</span>
                <span>You own</span>
                <span />
              </div>
              {filterRows(result.tracks, matches, filter).map((track) => (
                <SetTrackRow
                  key={track.index}
                  track={track}
                  untimed={untimed}
                  nowPlaying={current?.track.index === track.index}
                  videoPlaying={videoPlaying}
                  match={matches?.byIndex.get(track.index)}
                  saved={isSaved(track)}
                  echo={echoes.get(track.index)}
                  onPlayFrom={play}
                  onTogglePause={() => useSetPlayer.getState().togglePause()}
                  onPlayFile={onPlayFile}
                  onToggleSave={onToggleSave}
                  onFollowEcho={onFollowEcho}
                />
              ))}
            </div>
          </>
        )}

        {/* Named without a timestamp: under the rows, and under a set with
            no rows too, whose comments only name tracks. */}
        {ready && result && result.loose.length > 0 && (
          <section className="set-page__loose">
            <h3>Named without a timestamp</h3>
            <p className="set-page__note">Mentioned in the comments, but nobody said where in the set.</p>
            {result.loose.map((item) => (
              <div className="set-loose" key={item.key ?? item.title}>
                <span className="set-loose__name">
                  {item.artist ? `${item.artist} — ${item.title}` : item.title}
                  {item.mix && <span className="set-row__mix"> ({item.mix})</span>}
                </span>
                <span className="set-loose__by">{item.author}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
