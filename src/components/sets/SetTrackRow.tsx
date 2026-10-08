// src/components/sets/SetTrackRow.tsx
// One row of a set's tracklist (Sets redesign spec, Track rows):
// # · Time · Track · Lists · You own · ♡. The number turns into ▶ on hover
// (play the set from here) and into the equalizer while the video is inside
// this track, where hovering offers pause. An untimed list has no time and
// no ▶; a row with a timed copy in another set offers "↳ 12:30" instead.
import { Icon } from '../Icon'
import { Equalizer } from '../Equalizer'
import { StoreLinks } from './StoreLinks'
import type { Track } from '../../lib/tracklist'
import type { LibraryMatch } from '../../lib/tracklist/match'
import type { Track as LibraryTrack } from '../../types/track'
import type { TrackEcho } from '../../types/youtube'

interface SetTrackRowProps {
  track: Track
  untimed: boolean
  /** The video is inside this track. */
  nowPlaying: boolean
  /** …and playing, not paused. */
  videoPlaying: boolean
  match?: LibraryMatch
  saved: boolean
  /** The same record in another set, which does know where it sits. */
  echo?: TrackEcho
  /** Plays the set from this row's cue. */
  onPlayFrom: (cueMs: number) => void
  /** The row playing: pause or play the video. */
  onTogglePause: () => void
  onPlayFile: (track: LibraryTrack) => void
  onToggleSave: (track: Track) => void
  onFollowEcho: (echo: TrackEcho) => void
}

export function SetTrackRow({
  track,
  untimed,
  nowPlaying,
  videoPlaying,
  match,
  saved,
  echo,
  onPlayFrom,
  onTogglePause,
  onPlayFile,
  onToggleSave,
  onFollowEcho,
}: SetTrackRowProps) {
  const suggestion = track.suggestions?.[0]
  const extra = track.isUnknown
    ? [
        suggestion && `maybe: ${suggestion.artist ? `${suggestion.artist} — ` : ''}${suggestion.title}`,
        track.asks ? `asked ${track.asks}×, no answer` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : track.disagree.length > 0
      ? `or: ${track.disagree
          .map((d) => `${d.artist ? `${d.artist} — ${d.title}` : d.title} (${d.votes})`)
          .join(' · ')}`
      : ''
  const lonely = track.votes <= 1 && track.sourceCount > 1

  return (
    <div
      className={`set-row${track.isUnknown ? ' set-row--id' : ''}${nowPlaying ? ' set-row--now' : ''}`}
      data-cue={track.cueMs}
    >
      <span className="set-row__no">
        {nowPlaying ? (
          <Equalizer playing={videoPlaying} />
        ) : (
          <span className="set-row__index">{track.index}</span>
        )}
        {!untimed && (
          <button
            type="button"
            className="set-row__play"
            aria-label={
              nowPlaying ? (videoPlaying ? 'Pause the set' : 'Play the set') : `Play the set from ${track.cue}`
            }
            onClick={() => (nowPlaying ? onTogglePause() : onPlayFrom(track.cueMs))}
          >
            <Icon name={nowPlaying && videoPlaying ? 'Pause' : 'Play'} size={13} />
          </button>
        )}
      </span>

      <span className="set-row__time">
        {untimed ? (
          echo && (
            <button
              type="button"
              className="set-row__echo"
              onClick={() => onFollowEcho(echo)}
              title={`Heard at ${echo.cue ?? ''} in "${echo.set_title ?? 'another set'}"`}
            >
              ↳ {echo.cue}
            </button>
          )
        ) : (
          track.cue
        )}
      </span>

      <span className="set-row__track">
        <span className="set-row__name">
          {track.isUnknown ? (
            'ID'
          ) : (
            <>
              {track.artist ? `${track.artist} — ${track.title}` : track.title}
              {track.mix && <span className="set-row__mix"> ({track.mix})</span>}
              {track.uncertain && ' ?'}
            </>
          )}
          {!track.isUnknown && (
            <StoreLinks artist={track.artist} title={track.title} mix={track.mix} className="set-row__stores" />
          )}
        </span>
        {extra && <span className="set-row__extra">{extra}</span>}
      </span>

      <span className={`set-row__lists${lonely ? ' set-row__lists--lonely' : ''}`}>
        {track.fromComments ? 'comments' : !track.isUnknown && track.sourceCount > 0 ? `${track.votes}/${track.sourceCount}` : ''}
      </span>

      <span className="set-row__own">
        {match ? (
          <button
            type="button"
            className="set-row__have"
            onClick={() => onPlayFile(match.track as LibraryTrack)}
            title={`Play your file: ${match.track.artist ?? ''} — ${match.track.title ?? ''}`}
          >
            <Icon name="Play" size={11} /> have it
          </button>
        ) : (
          !track.isUnknown && <span className="set-row__missing">missing</span>
        )}
      </span>

      <span className="set-row__heart-cell">
        {!track.isUnknown && (
          <button
            type="button"
            className={`set-row__heart${saved ? ' set-row__heart--on' : ''}`}
            aria-label={saved ? 'Remove from Saved tracks' : 'Save this track'}
            aria-pressed={saved}
            onClick={() => onToggleSave(track)}
          >
            <Icon name="Heart" size={13} />
          </button>
        )}
      </span>
    </div>
  )
}
