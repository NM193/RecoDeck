// src/components/sets/SetPlayerBar.tsx
// The set video, small, in a bar above the bottom player (Sets redesign
// spec, Playing): it shows while a set plays and you are not on its page.
// The panel is laid over the bar's video box; the text opens the set again,
// and ⏮ / ⏭ follow the track the playhead is in.
import { Icon } from '../Icon'
import { barShows } from '../../lib/setPlayer/panelBounds'
import { playheadTrack, stepCue } from '../../lib/setPlayer/playhead'
import { useSetPlayer, videoIsPlaying } from '../../store/setPlayerStore'
import './SetPlayerBar.css'

export function SetPlayerBar({ onOpenSet }: { onOpenSet: (videoId: string) => void }) {
  const playing = useSetPlayer((s) => s.playing)
  const panel = useSetPlayer((s) => s.panel)
  const pageBoxMounted = useSetPlayer((s) => s.pageBox !== null)
  const attachBarBox = useSetPlayer((s) => s.attachBarBox)
  const step = useSetPlayer((s) => s.step)
  const togglePause = useSetPlayer((s) => s.togglePause)
  const stop = useSetPlayer((s) => s.stop)

  if (!playing || !barShows(true, pageBoxMounted)) return null

  const { result } = playing
  const untimed = Boolean(result.untimed)
  const position = panel?.position_ms ?? playing.startMs
  const duration = panel && panel.duration_ms > 0 ? panel.duration_ms : result.video.durationMs
  const now = playheadTrack(result.tracks, untimed, position, duration)
  const name = now ? (now.track.artist ? `${now.track.artist} — ${now.track.title}` : now.track.title) : null
  const playingNow = videoIsPlaying(panel)

  return (
    <div className="set-bar">
      {/* Left empty: the YouTube panel is laid exactly over this box. */}
      <div className="set-bar__video" ref={attachBarBox} />
      <button
        type="button"
        className="set-bar__text"
        onClick={() => onOpenSet(result.video.id)}
        title={`Open ${result.video.title}`}
      >
        <span className="set-bar__now">
          {now && name ? (
            <>
              <span className="set-bar__cue">{now.track.cue}</span> {name}
            </>
          ) : (
            result.video.title
          )}
        </span>
        <span className="set-bar__set">{now ? result.video.title : result.video.channel}</span>
      </button>
      <div className="set-bar__controls">
        <button
          type="button"
          className="btn set-bar__btn"
          aria-label="Previous track"
          disabled={stepCue(result.tracks, untimed, position, -1) === null}
          onClick={() => step(-1)}
        >
          <Icon name="SkipBack" size={14} />
        </button>
        <button
          type="button"
          className="btn set-bar__btn"
          aria-label={playingNow ? 'Pause' : 'Play'}
          onClick={togglePause}
        >
          <Icon name={playingNow ? 'Pause' : 'Play'} size={14} />
        </button>
        <button
          type="button"
          className="btn set-bar__btn"
          aria-label="Next track"
          disabled={stepCue(result.tracks, untimed, position, 1) === null}
          onClick={() => step(1)}
        >
          <Icon name="SkipForward" size={14} />
        </button>
        <button type="button" className="btn set-bar__btn" aria-label="Stop the set" onClick={stop}>
          <Icon name="X" size={14} />
        </button>
      </div>
    </div>
  )
}
