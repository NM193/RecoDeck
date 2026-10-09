// src/components/sets/TrackScrubber.tsx
// The track playing, as one strip you can wind through (Sets redesign spec,
// Playing): under the set's video on its page.
import { msToCue, type Track } from '../../lib/tracklist'

/**
 * The track that is playing, as one strip you can wind through.
 *
 * The timeline above covers the whole set, which is right for jumping between
 * tracks and useless for moving thirty seconds inside one: five minutes of a
 * two-hour set is four percent of the bar. This gives that one track the full
 * width.
 */
export function TrackScrubber({
  track,
  startMs,
  endMs,
  positionMs,
  onSeek,
}: {
  track: Track
  startMs: number
  endMs: number
  positionMs: number
  onSeek: (ms: number) => void
}) {
  const length = Math.max(1, endMs - startMs)
  const elapsed = Math.min(Math.max(0, positionMs - startMs), length)
  const fraction = elapsed / length

  /** Where in the track a click on the bar landed. */
  function seekFromEvent(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    onSeek(startMs + ratio * length)
  }

  return (
    <div className="sets-scrub">
      <div className="sets-scrub__head">
        <span className="sets-scrub__name">
          {track.artist ? (
            <>
              <span className="sets-track__artist">{track.artist}</span> — {track.title}
            </>
          ) : (
            track.title
          )}
        </span>
        {/* Timed from the start of the track, not of the set — the question
            being answered here is how far into this record we are. */}
        <span className="sets-scrub__time">
          {msToCue(elapsed)} / {msToCue(length)}
        </span>
      </div>

      <div
        className="sets-scrub__bar"
        onClick={seekFromEvent}
        onMouseDown={(e) => {
          // Dragging is the same question asked repeatedly.
          const bar = e.currentTarget
          const move = (event: MouseEvent) => {
            const box = bar.getBoundingClientRect()
            if (box.width <= 0) return
            const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
            onSeek(startMs + ratio * length)
          }
          const up = () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      >
        <div className="sets-scrub__fill" style={{ width: `${fraction * 100}%` }} />
        <div className="sets-scrub__knob" style={{ left: `${fraction * 100}%` }} />
      </div>
    </div>
  )
}
